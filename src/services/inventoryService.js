const crypto = require("node:crypto");
const mongoose = require("mongoose");
const {
  Inventory,
  InventoryOperation,
  Location,
  Product,
  StockMovement,
  Warehouse,
} = require("../models");
const {
  AppError,
  buildPaginatedResponse,
  isValidObjectId,
  parsePagination,
  validateDateRange,
} = require("../utils");
const { STOCK_MOVEMENT_TYPES } = require("../constants");

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertId = (value, field) => {
  if (!isValidObjectId(value)) {
    throw new AppError(`Invalid ${field}.`, 400, { field });
  }
  return new mongoose.Types.ObjectId(value);
};

const getAccessibleWarehouseIds = async (user) => {
  if (user.role === "ADMIN") return null;
  const ids = new Set((user.assignedWarehouses || []).map(String));
  const managedIds = await Warehouse.find({ manager: user._id }).distinct("_id");
  managedIds.forEach((id) => ids.add(String(id)));
  return [...ids].map((id) => new mongoose.Types.ObjectId(id));
};

const assertWarehouseAccess = async (user, warehouseId) => {
  const warehouse = await Warehouse.findById(warehouseId)
    .select("_id manager isActive")
    .lean();
  if (!warehouse) throw new AppError("Warehouse not found.", 404);
  if (user.role !== "ADMIN") {
    const assigned = (user.assignedWarehouses || []).some(
      (id) => String(id) === String(warehouse._id),
    );
    const manager = String(warehouse.manager || "") === String(user._id);
    if (!assigned && !manager) {
      throw new AppError("Access denied for this warehouse.", 403);
    }
  }
  return warehouse;
};

const assertActiveOperationResources = async (
  { productId, warehouseId, locationId },
  session,
) => {
  const product = await Product.findOne({ _id: productId, isActive: true })
    .select("_id sku name unit minimumStockLevel")
    .session(session)
    .lean();
  const warehouse = await Warehouse.findOne({ _id: warehouseId, isActive: true })
    .select("_id code name")
    .session(session)
    .lean();
  const location = await Location.findOne({
    _id: locationId,
    warehouse: warehouseId,
    isActive: true,
  })
    .select("_id code name warehouse")
    .session(session)
    .lean();
  if (!product) throw new AppError("Active product not found.", 404);
  if (!warehouse) throw new AppError("Active warehouse not found.", 404);
  if (!location) {
    const foundLocation = await Location.findById(locationId)
      .select("_id warehouse isActive")
      .session(session)
      .lean();
    if (foundLocation && String(foundLocation.warehouse) !== String(warehouseId)) {
      throw new AppError("Location does not belong to the selected warehouse.", 400);
    }
    throw new AppError("Active location not found.", 404);
  }
  return { product, warehouse, location };
};

const normalizeOperation = (body, adjustment) => {
  body = body && typeof body === "object" ? body : {};
  const productId = assertId(body.productId, "productId");
  const warehouseId = assertId(body.warehouseId, "warehouseId");
  const locationId = assertId(body.locationId, "locationId");
  const requestedQuantity = adjustment ? body.newQuantity : body.quantity;
  const quantity = Number(requestedQuantity);
  if (
    requestedQuantity === undefined ||
    requestedQuantity === null ||
    (typeof requestedQuantity !== "number" &&
      typeof requestedQuantity !== "string") ||
    String(requestedQuantity).trim() === "" ||
    !Number.isFinite(quantity) ||
    (adjustment ? quantity < 0 : quantity <= 0)
  ) {
    throw new AppError(
      adjustment
        ? "newQuantity must be a non-negative number."
        : "quantity must be a positive number.",
      400,
      { field: adjustment ? "newQuantity" : "quantity" },
    );
  }

  const reason = String(body.reason || "").trim();
  if (!reason) throw new AppError("reason is required.", 400, { field: "reason" });
  if (reason.length > 200) {
    throw new AppError("reason cannot exceed 200 characters.", 400, {
      field: "reason",
    });
  }
  const reference = String(body.reference || "").trim();
  const notes = String(body.notes || "").trim();
  if (reference.length > 100) {
    throw new AppError("reference cannot exceed 100 characters.", 400, {
      field: "reference",
    });
  }
  if (notes.length > 1000) {
    throw new AppError("notes cannot exceed 1000 characters.", 400, {
      field: "notes",
    });
  }

  return {
    productId,
    warehouseId,
    locationId,
    quantity,
    adjustment,
    reason,
    reference,
    notes,
  };
};

const getIdempotencyKey = (req) => {
  const key = req.get("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 128) {
    throw new AppError(
      "A valid Idempotency-Key header (8-128 characters) is required.",
      400,
      { field: "Idempotency-Key" },
    );
  }
  return key;
};

const makeFingerprint = (operation, userId) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        userId: String(userId),
        productId: String(operation.productId),
        warehouseId: String(operation.warehouseId),
        locationId: String(operation.locationId),
        quantity: operation.quantity,
        adjustment: operation.adjustment,
        reason: operation.reason,
        reference: operation.reference,
        notes: operation.notes,
      }),
    )
    .digest("hex");

const serializeResult = (inventory, movement) => ({
  inventory: {
    id: String(inventory._id),
    product: String(inventory.product),
    warehouse: String(inventory.warehouse),
    location: String(inventory.location),
    quantity: inventory.quantity,
    updatedAt: inventory.updatedAt,
  },
  movement: {
    id: String(movement._id),
    movementType: movement.movementType,
    quantity: movement.quantity,
    previousQuantity: movement.previousQuantity,
    newQuantity: movement.newQuantity,
    reason: movement.reason,
    reference: movement.reference,
    performedBy: String(movement.performedBy),
    createdAt: movement.createdAt,
  },
});

const replayOrConflict = async ({ userId, key, fingerprint }) => {
  const previous = await InventoryOperation.findOne({ user: userId, key }).lean();
  if (!previous) return null;
  if (previous.fingerprint !== fingerprint) {
    throw new AppError(
      "Idempotency-Key has already been used with a different request.",
      409,
    );
  }
  return previous.result;
};

const isDuplicateKey = (error) => error && error.code === 11000;

const isTransactionUnsupported = (error) =>
  error?.code === 20 ||
  /transaction numbers are only allowed|does not support transactions/i.test(
    error?.message || "",
  );

const executeStockOperation = async (req, kind, retryCount = 0) => {
  const adjustment = kind === "adjust";
  const operation = normalizeOperation(req.body, adjustment);
  await assertWarehouseAccess(req.user, operation.warehouseId);
  const key = getIdempotencyKey(req);
  const fingerprint = makeFingerprint(operation, req.user._id);
  const replay = await replayOrConflict({
    userId: req.user._id,
    key,
    fingerprint,
  });
  if (replay) return { ...replay, replayed: true };

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const priorRequest = await InventoryOperation.findOne({
        user: req.user._id,
        key,
      })
        .session(session)
        .lean();
      if (priorRequest) {
        if (priorRequest.fingerprint !== fingerprint) {
          throw new AppError(
            "Idempotency-Key has already been used with a different request.",
            409,
          );
        }
        result = { ...priorRequest.result, replayed: true };
        return;
      }

      const { product } = await assertActiveOperationResources(operation, session);
      const inventoryQuery = {
        product: operation.productId,
        warehouse: operation.warehouseId,
        location: operation.locationId,
      };
      let inventory = await Inventory.findOne(inventoryQuery).session(session);
      const previousQuantity = inventory ? inventory.quantity : 0;
      let movementType;
      let newQuantity;
      let movementQuantity;

      if (kind === "stock-in") {
        movementType = STOCK_MOVEMENT_TYPES.STOCK_IN;
        movementQuantity = operation.quantity;
        newQuantity = previousQuantity + operation.quantity;
      } else if (kind === "stock-out") {
        if (!inventory) {
          throw new AppError("Inventory record not found.", 404);
        }
        if (previousQuantity < operation.quantity) {
          throw new AppError("Insufficient stock.", 409, {
            availableQuantity: previousQuantity,
            requestedQuantity: operation.quantity,
          });
        }
        movementType = STOCK_MOVEMENT_TYPES.STOCK_OUT;
        movementQuantity = operation.quantity;
        newQuantity = previousQuantity - operation.quantity;
      } else {
        if (operation.quantity === previousQuantity) {
          throw new AppError("newQuantity must differ from current quantity.", 400);
        }
        newQuantity = operation.quantity;
        movementQuantity = Math.abs(newQuantity - previousQuantity);
        movementType =
          newQuantity > previousQuantity
            ? STOCK_MOVEMENT_TYPES.ADJUSTMENT_IN
            : STOCK_MOVEMENT_TYPES.ADJUSTMENT_OUT;
      }

      if (inventory) {
        const update = await Inventory.updateOne(
          {
            _id: inventory._id,
            quantity:
              kind === "stock-out"
                ? { $eq: previousQuantity, $gte: operation.quantity }
                : previousQuantity,
          },
          { $set: { quantity: newQuantity } },
          { session, runValidators: true },
        );
        if (update.modifiedCount !== 1) {
          throw new AppError(
            kind === "stock-out" ? "Insufficient stock." : "Inventory changed; retry the operation.",
            kind === "stock-out" ? 409 : 409,
          );
        }
        inventory.quantity = newQuantity;
        inventory.updatedAt = new Date();
      } else {
        [inventory] = await Inventory.create(
          [
            {
              ...inventoryQuery,
              quantity: newQuantity,
            },
          ],
          { session },
        );
      }

      const [movement] = await StockMovement.create(
        [
          {
            ...inventoryQuery,
            movementType,
            quantity: movementQuantity,
            previousQuantity,
            newQuantity,
            reason: operation.reason,
            reference: operation.reference,
            notes: operation.notes,
            performedBy: req.user._id,
          },
        ],
        { session },
      );

      result = serializeResult(inventory, movement);
      await InventoryOperation.create(
        [
          {
            user: req.user._id,
            key,
            fingerprint,
            result,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        ],
        { session },
      );
    });
    return result;
  } catch (error) {
    if (isDuplicateKey(error)) {
      const idempotentResult = await replayOrConflict({
        userId: req.user._id,
        key,
        fingerprint,
      });
      if (idempotentResult) return { ...idempotentResult, replayed: true };
      const duplicateInventoryPair =
        error.keyPattern?.product && error.keyPattern?.location;
      if (duplicateInventoryPair && retryCount < 2) {
        return executeStockOperation(req, kind, retryCount + 1);
      }
    }
    if (isTransactionUnsupported(error)) {
      throw new AppError(
        "Stock operations require MongoDB transactions. Configure MongoDB as a replica set or sharded cluster.",
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const stockIn = (req) => executeStockOperation(req, "stock-in");
const stockOut = (req) => executeStockOperation(req, "stock-out");
const adjustStock = (req) => executeStockOperation(req, "adjust");

const parseOptionalId = (value, field) =>
  value === undefined || value === "" ? undefined : assertId(value, field);

const listInventory = async (req) => {
  const { page, limit } = parsePagination(req.query);
  const accessibleIds = await getAccessibleWarehouseIds(req.user);
  const selectedWarehouse = parseOptionalId(req.query.warehouse, "warehouse");
  const selectedProduct = parseOptionalId(req.query.product, "product");
  const selectedLocation = parseOptionalId(req.query.location, "location");
  const selectedCategory = parseOptionalId(req.query.category, "category");

  if (selectedWarehouse) {
    await assertWarehouseAccess(req.user, selectedWarehouse);
  }

  const match = {};
  if (accessibleIds) match.warehouse = { $in: accessibleIds };
  if (selectedWarehouse) match.warehouse = selectedWarehouse;
  if (selectedProduct) match.product = selectedProduct;
  if (selectedLocation) match.location = selectedLocation;
  const stockStatus = req.inventoryStockStatus || req.query.stockStatus;
  if (
    stockStatus &&
    !["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"].includes(stockStatus)
  ) {
    throw new AppError("Invalid stockStatus.", 400, { field: "stockStatus" });
  }

  const productConditions = [];
  if (selectedCategory) {
    productConditions.push({ "product.category": selectedCategory });
  }
  if (req.query.search) {
    const search = escapeRegex(String(req.query.search).trim());
    productConditions.push({
      $or: [
        { "product.name": { $regex: search, $options: "i" } },
        { "product.sku": { $regex: search, $options: "i" } },
      ],
    });
  }

  const sortMap = {
    updatedAt: "updatedAt",
    quantity: "quantity",
    productName: "product.name",
    sku: "product.sku",
    createdAt: "createdAt",
  };
  const requestedSort = req.query.sort || "-updatedAt";
  const descending = requestedSort.startsWith("-");
  const sortField = descending ? requestedSort.slice(1) : requestedSort;
  if (!sortMap[sortField]) {
    throw new AppError("Unsupported sort field.", 400, { field: "sort" });
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: Product.collection.name,
        localField: "product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    ...(productConditions.length
      ? [{ $match: { $and: productConditions } }]
      : []),
    {
      $lookup: {
        from: "categories",
        localField: "product.category",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: Warehouse.collection.name,
        localField: "warehouse",
        foreignField: "_id",
        as: "warehouse",
      },
    },
    { $unwind: "$warehouse" },
    {
      $lookup: {
        from: Location.collection.name,
        localField: "location",
        foreignField: "_id",
        as: "location",
      },
    },
    { $unwind: "$location" },
  ];

  if (stockStatus) {
    const statusExpression =
      stockStatus === "OUT_OF_STOCK"
        ? { $lte: ["$quantity", 0] }
        : stockStatus === "LOW_STOCK"
          ? {
              $and: [
                { $gt: ["$quantity", 0] },
                { $lte: ["$quantity", { $ifNull: ["$product.minimumStockLevel", 0] }] },
              ],
            }
          : {
              $gt: ["$quantity", { $ifNull: ["$product.minimumStockLevel", 0] }],
            };
    pipeline.push({ $match: { $expr: statusExpression } });
  }

  const direction = descending ? -1 : 1;
  pipeline.push(
    { $sort: { [sortMap[sortField]]: direction, _id: 1 } },
    {
      $facet: {
        metadata: [{ $count: "totalItems" }],
        records: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              quantity: 1,
              updatedAt: 1,
              minimumStockLevel: "$product.minimumStockLevel",
              stockStatus: {
                $cond: [
                  { $lte: ["$quantity", 0] },
                  "OUT_OF_STOCK",
                  {
                    $cond: [
                      {
                        $lte: [
                          "$quantity",
                          { $ifNull: ["$product.minimumStockLevel", 0] },
                        ],
                      },
                      "LOW_STOCK",
                      "IN_STOCK",
                    ],
                  },
                ],
              },
              product: {
                id: { $toString: "$product._id" },
                name: "$product.name",
                sku: "$product.sku",
                unit: "$product.unit",
              },
              category: {
                id: { $toString: "$category._id" },
                name: "$category.name",
              },
              warehouse: {
                id: { $toString: "$warehouse._id" },
                name: "$warehouse.name",
                code: "$warehouse.code",
              },
              location: {
                id: { $toString: "$location._id" },
                name: "$location.name",
                code: "$location.code",
              },
            },
          },
        ],
      },
    },
  );

  const [result] = await Inventory.aggregate(pipeline);
  const totalItems = result?.metadata[0]?.totalItems || 0;
  return buildPaginatedResponse({
    data: result?.records || [],
    page,
    limit,
    totalItems,
  });
};

const getInventory = async (req) => {
  const inventoryId = assertId(req.params.inventoryId, "inventoryId");
  const record = await Inventory.findById(inventoryId)
    .populate({
      path: "product",
      select: "name sku unit minimumStockLevel category",
      populate: { path: "category", select: "name" },
    })
    .populate({ path: "warehouse", select: "name code" })
    .populate({ path: "location", select: "name code" })
    .select("-__v")
    .lean();
  if (!record) throw new AppError("Inventory record not found.", 404);
  await assertWarehouseAccess(req.user, record.warehouse._id);
  const minimumStockLevel = record.product.minimumStockLevel || 0;
  return {
    id: String(record._id),
    quantity: record.quantity,
    updatedAt: record.updatedAt,
    minimumStockLevel,
    stockStatus:
      record.quantity <= 0
        ? "OUT_OF_STOCK"
        : record.quantity <= minimumStockLevel
          ? "LOW_STOCK"
          : "IN_STOCK",
    product: record.product,
    warehouse: record.warehouse,
    location: record.location,
  };
};

const listMovements = async (req) => {
  const { page, limit } = parsePagination(req.query);
  const filter = {};
  const idFields = [
    ["product", "product"],
    ["warehouse", "warehouse"],
    ["location", "location"],
    ["user", "performedBy"],
  ];
  for (const [parameter, field] of idFields) {
    const id = parseOptionalId(req.query[parameter], parameter);
    if (id) filter[field] = id;
  }
  if (req.query.type) {
    if (!Object.values(STOCK_MOVEMENT_TYPES).includes(req.query.type)) {
      throw new AppError("Invalid movement type.", 400, { field: "type" });
    }
    filter.movementType = req.query.type;
  }
  if (req.query.reference) {
    filter.reference = {
      $regex: escapeRegex(String(req.query.reference).trim()),
      $options: "i",
    };
  }
  let range;
  try {
    range = validateDateRange({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
  } catch (error) {
    throw new AppError(error.message, 400);
  }
  if (range.startDate || range.endDate) {
    filter.createdAt = {};
    if (range.startDate) filter.createdAt.$gte = range.startDate;
    if (range.endDate) filter.createdAt.$lte = range.endDate;
  }

  const accessibleIds = await getAccessibleWarehouseIds(req.user);
  if (accessibleIds) {
    if (filter.warehouse && !accessibleIds.some((id) => id.equals(filter.warehouse))) {
      throw new AppError("Access denied for this warehouse.", 403);
    }
    filter.warehouse = filter.warehouse || { $in: accessibleIds };
  } else if (filter.warehouse) {
    await assertWarehouseAccess(req.user, filter.warehouse);
  }

  const requestedSort = String(req.query.sort || "-createdAt");
  const descending = requestedSort.startsWith("-");
  const field = descending ? requestedSort.slice(1) : requestedSort;
  if (!["createdAt", "quantity", "movementType"].includes(field)) {
    throw new AppError("Unsupported sort field.", 400, { field: "sort" });
  }
  const sort = { [field]: descending ? -1 : 1, _id: 1 };
  const [totalItems, records] = await Promise.all([
    StockMovement.countDocuments(filter),
    StockMovement.find(filter)
      .select("-__v")
      .populate({ path: "product", select: "name sku unit" })
      .populate({ path: "warehouse", select: "name code" })
      .populate({ path: "location", select: "name code" })
      .populate({ path: "performedBy", select: "firstName lastName" })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  return buildPaginatedResponse({
    data: records.map((record) => ({
      id: String(record._id),
      product: record.product,
      warehouse: record.warehouse,
      location: record.location,
      movementType: record.movementType,
      quantity: record.quantity,
      previousQuantity: record.previousQuantity,
      newQuantity: record.newQuantity,
      reason: record.reason,
      reference: record.reference,
      notes: record.notes,
      performedBy: record.performedBy,
      createdAt: record.createdAt,
    })),
    page,
    limit,
    totalItems,
  });
};

const getMovement = async (req) => {
  const movementId = assertId(req.params.movementId, "movementId");
  const record = await StockMovement.findById(movementId)
    .select("-__v")
    .populate({ path: "product", select: "name sku unit" })
    .populate({ path: "warehouse", select: "name code" })
    .populate({ path: "location", select: "name code" })
    .populate({ path: "performedBy", select: "firstName lastName email" })
    .lean();
  if (!record) throw new AppError("Stock movement not found.", 404);
  await assertWarehouseAccess(req.user, record.warehouse._id);
  return {
    id: String(record._id),
    product: record.product,
    warehouse: record.warehouse,
    location: record.location,
    movementType: record.movementType,
    quantity: record.quantity,
    previousQuantity: record.previousQuantity,
    newQuantity: record.newQuantity,
    reason: record.reason,
    reference: record.reference,
    notes: record.notes,
    performedBy: record.performedBy,
    createdAt: record.createdAt,
  };
};

module.exports = {
  listInventory,
  getInventory,
  stockIn,
  stockOut,
  adjustStock,
  listMovements,
  getMovement,
};
