const mongoose = require("mongoose");
const {
  Inventory,
  Location,
  Product,
  StockMovement,
  Transfer,
  Warehouse,
} = require("../models");
const {
  AppError,
  buildPaginatedResponse,
  isValidObjectId,
  parsePagination,
} = require("../utils");
const inventoryService = require("./inventoryService");
const transferService = require("./transferService");

const parseId = (value, field) => {
  if (!isValidObjectId(value)) {
    throw new AppError(`Invalid ${field}.`, 400, { field });
  }
  return new mongoose.Types.ObjectId(value);
};

const accessibleWarehouseIds = async (user) => {
  if (user.role === "ADMIN") return null;
  const ids = new Set((user.assignedWarehouses || []).map(String));
  const managed = await Warehouse.find({ manager: user._id }).distinct("_id");
  managed.forEach((id) => ids.add(String(id)));
  return [...ids].map((id) => new mongoose.Types.ObjectId(id));
};

const assertWarehouseAccess = async (user, id) => {
  const warehouse = await Warehouse.findById(id).select("_id manager").lean();
  if (!warehouse) throw new AppError("Warehouse not found.", 404);
  if (user.role === "ADMIN") return warehouse;
  const assigned = (user.assignedWarehouses || []).some(
    (assignedId) => String(assignedId) === String(id),
  );
  const managed = String(warehouse.manager || "") === String(user._id);
  if (!assigned && !managed) {
    throw new AppError("Access denied for this warehouse.", 403);
  }
  return warehouse;
};

const strictDateBoundaries = (query) => {
  const parse = (value, field) => {
    if (value === undefined || value === "") return undefined;
    const input = String(value);
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
    const dateTime =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        input,
      );
    if (!dateOnly && !dateTime) {
      throw new AppError(`${field} must be an ISO-8601 date or timestamp.`, 400, {
        field,
      });
    }
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppError(`${field} must be a valid date.`, 400, { field });
    }
    const calendarDate = new Date(`${input.slice(0, 10)}T00:00:00.000Z`);
    if (
      Number.isNaN(calendarDate.getTime()) ||
      calendarDate.toISOString().slice(0, 10) !== input.slice(0, 10)
    ) {
      throw new AppError(`${field} must be a valid calendar date.`, 400, {
        field,
      });
    }
    if (dateOnly && field === "endDate") parsed.setUTCHours(23, 59, 59, 999);
    return parsed;
  };

  const startDate = parse(query.startDate, "startDate");
  const endDate = parse(query.endDate, "endDate");
  if (startDate && endDate && endDate < startDate) {
    throw new AppError("endDate must not be earlier than startDate.", 400, {
      field: "endDate",
    });
  }
  return { startDate, endDate };
};

const inventoryRequest = (req, forcedStatus) => {
  const boundaries = strictDateBoundaries(req.query);
  return {
    ...req,
    query: {
      ...req.query,
      ...(req.query.warehouseId ? { warehouse: req.query.warehouseId } : {}),
    },
    ...(forcedStatus ? { inventoryStockStatus: forcedStatus } : {}),
    ...(boundaries.startDate || boundaries.endDate
      ? { inventoryUpdatedAtRange: boundaries }
      : {}),
  };
};

const inventoryReport = (req) =>
  inventoryService.listInventory(inventoryRequest(req));

const lowStockReport = (req) =>
  inventoryService.listInventory(
    inventoryRequest(req, "LOW_STOCK"),
  );

const warehouseInventoryReport = async (req) => {
  const { page, limit } = parsePagination(req.query);
  const accessibleIds = await accessibleWarehouseIds(req.user);
  const requestedWarehouse = req.query.warehouse
    ? parseId(req.query.warehouse, "warehouse")
    : undefined;
  if (requestedWarehouse) {
    await assertWarehouseAccess(req.user, requestedWarehouse);
  }

  const match = {};
  if (accessibleIds) match.warehouse = { $in: accessibleIds };
  if (requestedWarehouse) match.warehouse = requestedWarehouse;
  if (req.query.location) match.location = parseId(req.query.location, "location");
  if (req.query.product) match.product = parseId(req.query.product, "product");

  const boundaries = strictDateBoundaries(req.query);
  if (boundaries.startDate || boundaries.endDate) {
    match.updatedAt = {};
    if (boundaries.startDate) match.updatedAt.$gte = boundaries.startDate;
    if (boundaries.endDate) match.updatedAt.$lte = boundaries.endDate;
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
  ];
  if (req.query.category) {
    pipeline.push({
      $match: { "product.category": parseId(req.query.category, "category") },
    });
  }
  if (req.query.search) {
    const search = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pipeline.push({
      $match: {
        $or: [
          { "product.name": { $regex: search, $options: "i" } },
          { "product.sku": { $regex: search, $options: "i" } },
        ],
      },
    });
  }
  pipeline.push(
    {
      $group: {
        _id: "$warehouse",
        totalInventoryUnits: { $sum: "$quantity" },
        inventoryRecordCount: { $sum: 1 },
        productIds: { $addToSet: "$product" },
        locationIds: { $addToSet: "$location" },
        lowStockRecordCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ["$quantity", 0] },
                  { $lte: ["$quantity", { $ifNull: ["$product.minimumStockLevel", 0] }] },
                ],
              },
              1,
              0,
            ],
          },
        },
        outOfStockRecordCount: {
          $sum: { $cond: [{ $lte: ["$quantity", 0] }, 1, 0] },
        },
      },
    },
    {
      $lookup: {
        from: Warehouse.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "warehouse",
      },
    },
    { $unwind: "$warehouse" },
    {
      $project: {
        _id: 0,
        warehouse: {
          id: { $toString: "$warehouse._id" },
          name: "$warehouse.name",
          code: "$warehouse.code",
        },
        totalInventoryUnits: 1,
        inventoryRecordCount: 1,
        productCount: { $size: "$productIds" },
        locationCount: { $size: "$locationIds" },
        lowStockRecordCount: 1,
        outOfStockRecordCount: 1,
      },
    },
  );
  const requestedSort = String(req.query.sort || "warehouseName");
  const descending = requestedSort.startsWith("-");
  const sortField = descending ? requestedSort.slice(1) : requestedSort;
  const sortFields = {
    warehouseName: "warehouse.name",
    totalInventoryUnits: "totalInventoryUnits",
    productCount: "productCount",
    locationCount: "locationCount",
  };
  if (!sortFields[sortField]) {
    throw new AppError("Unsupported sort field.", 400, { field: "sort" });
  }
  pipeline.push(
    { $sort: { [sortFields[sortField]]: descending ? -1 : 1 } },
    {
      $facet: {
        metadata: [{ $count: "totalItems" }],
        records: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  );
  const [result] = await Inventory.aggregate(pipeline);
  return buildPaginatedResponse({
    data: result?.records || [],
    page,
    limit,
    totalItems: result?.metadata[0]?.totalItems || 0,
  });
};

const movementReport = (req) => {
  const boundaries = strictDateBoundaries(req.query);
  return inventoryService.listMovements({
    ...req,
    query: {
      ...req.query,
      type: req.query.movementType || req.query.type,
      user: req.query.performedBy || req.query.user,
      reference: req.query.search || req.query.reference,
      ...(boundaries.startDate
        ? { startDate: boundaries.startDate.toISOString() }
        : {}),
      ...(boundaries.endDate
        ? { endDate: boundaries.endDate.toISOString() }
        : {}),
    },
  });
};

const transferReport = (req) => {
  const boundaries = strictDateBoundaries(req.query);
  const accessChecks = [
    ["warehouse", req.query.warehouse],
    ["sourceWarehouse", req.query.sourceWarehouse],
    ["destinationWarehouse", req.query.destinationWarehouse],
  ]
    .filter(([, id]) => Boolean(id))
    .map(([parameter, id]) =>
      assertWarehouseAccess(req.user, parseId(id, parameter)),
    );
  return Promise.all(accessChecks).then(() =>
    transferService.listTransfers({
      ...req,
      query: {
        ...req.query,
        status: req.query.transferStatus || req.query.status,
        reference: req.query.search || req.query.reference,
        ...(boundaries.startDate
          ? { startDate: boundaries.startDate.toISOString() }
          : {}),
        ...(boundaries.endDate
          ? { endDate: boundaries.endDate.toISOString() }
          : {}),
      },
    }),
  );
};

const dashboardSummary = async (req) => {
  const warehouseIds = await accessibleWarehouseIds(req.user);
  const warehouseMatch = warehouseIds ? { _id: { $in: warehouseIds } } : {};
  const inventoryMatch = warehouseIds ? { warehouse: { $in: warehouseIds } } : {};
  const movementMatch = warehouseIds ? { warehouse: { $in: warehouseIds } } : {};
  const transferScope = warehouseIds
    ? {
        $or: [
          { sourceWarehouse: { $in: warehouseIds } },
          { destinationWarehouse: { $in: warehouseIds } },
          { initiatedBy: req.user._id },
        ],
      }
    : {};

  const isStaff = req.user.role === "STAFF";
  const productCountPromise = req.user.role !== "ADMIN"
    ? Inventory.distinct("product", inventoryMatch).then((ids) =>
        Product.countDocuments({ _id: { $in: ids }, isActive: true }),
      )
    : Product.countDocuments({ isActive: true });

  const [
    totalWarehouses,
    totalLocations,
    activeProducts,
    inventoryTotals,
    productStockTotals,
    pendingTransfers,
    recentMovements,
    recentTransfers,
    inventoryByWarehouse,
    movementTotals,
  ] = await Promise.all([
    Warehouse.countDocuments({ ...warehouseMatch, isActive: true }),
    Location.countDocuments({
      ...(warehouseIds ? { warehouse: { $in: warehouseIds } } : {}),
      isActive: true,
    }),
    productCountPromise,
    Inventory.aggregate([
      { $match: inventoryMatch },
      { $group: { _id: null, totalInventoryUnits: { $sum: "$quantity" } } },
    ]),
    Inventory.aggregate([
      { $match: inventoryMatch },
      {
        $lookup: {
          from: Product.collection.name,
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      { $match: { "product.isActive": true } },
      {
        $group: {
          _id: {
            product: "$product._id",
            warehouse: "$warehouse",
          },
          quantity: { $sum: "$quantity" },
          minimumStockLevel: { $first: "$product.minimumStockLevel" },
        },
      },
    ]),
    Transfer.countDocuments({
      ...transferScope,
      status: "PENDING",
      ...(isStaff ? { initiatedBy: req.user._id } : {}),
    }),
    StockMovement.find({
      ...movementMatch,
      ...(isStaff ? { performedBy: req.user._id } : {}),
    })
      .select("-__v")
      .populate({ path: "product", select: "name sku unit" })
      .populate({ path: "warehouse", select: "name code" })
      .populate({ path: "location", select: "name code" })
      .sort({ createdAt: -1, _id: 1 })
      .limit(5)
      .lean(),
    Transfer.find({
      ...transferScope,
      ...(isStaff ? { initiatedBy: req.user._id } : {}),
    })
      .select("reference product quantity sourceWarehouse sourceLocation destinationWarehouse destinationLocation status initiatedBy createdAt")
      .populate({ path: "product", select: "name sku" })
      .populate({ path: "sourceWarehouse", select: "name code" })
      .populate({ path: "sourceLocation", select: "name code" })
      .populate({ path: "destinationWarehouse", select: "name code" })
      .populate({ path: "destinationLocation", select: "name code" })
      .sort({ createdAt: -1, _id: 1 })
      .limit(5)
      .lean(),
    Inventory.aggregate([
      { $match: inventoryMatch },
      {
        $group: {
          _id: "$warehouse",
          totalInventoryUnits: { $sum: "$quantity" },
          inventoryRecordCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: Warehouse.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "warehouse",
        },
      },
      { $unwind: "$warehouse" },
      {
        $project: {
          _id: 0,
          warehouse: {
            id: { $toString: "$warehouse._id" },
            name: "$warehouse.name",
            code: "$warehouse.code",
          },
          totalInventoryUnits: 1,
          inventoryRecordCount: 1,
        },
      },
      { $sort: { "warehouse.name": 1 } },
      { $limit: 50 },
    ]),
    isStaff
      ? Promise.resolve([])
      : StockMovement.aggregate([
          { $match: movementMatch },
          {
            $group: {
              _id: "$movementType",
              count: { $sum: 1 },
              quantity: { $sum: "$quantity" },
            },
          },
          { $sort: { _id: 1 } },
        ]),
  ]);

  const lowStockProductIds = new Set();
  const totalByProduct = new Map();
  for (const stock of productStockTotals) {
    const productId = String(stock._id.product);
    totalByProduct.set(
      productId,
      (totalByProduct.get(productId) || 0) + stock.quantity,
    );
    if (
      stock.quantity > 0 &&
      stock.quantity <= (stock.minimumStockLevel || 0)
    ) {
      lowStockProductIds.add(productId);
    }
  }
  const productStock = {
    lowStockProductCount: lowStockProductIds.size,
    outOfStockProductCount: [...totalByProduct.values()].filter(
      (quantity) => quantity <= 0,
    ).length,
  };
  return {
    role: req.user.role,
    totals: {
      warehouses: totalWarehouses,
      locations: totalLocations,
      activeProducts,
      inventoryUnits: inventoryTotals[0]?.totalInventoryUnits || 0,
      lowStockProducts: productStock.lowStockProductCount,
      outOfStockProducts: productStock.outOfStockProductCount,
      pendingTransfers,
    },
    recentStockMovements: recentMovements.map((movement) => ({
      id: String(movement._id),
      movementType: movement.movementType,
      quantity: movement.quantity,
      previousQuantity: movement.previousQuantity,
      newQuantity: movement.newQuantity,
      reference: movement.reference,
      createdAt: movement.createdAt,
      product: movement.product,
      warehouse: movement.warehouse,
      location: movement.location,
    })),
    recentTransfers: recentTransfers.map((transfer) => ({
      id: String(transfer._id),
      reference: transfer.reference,
      quantity: transfer.quantity,
      status: transfer.status,
      createdAt: transfer.createdAt,
      product: transfer.product,
      sourceWarehouse: transfer.sourceWarehouse,
      sourceLocation: transfer.sourceLocation,
      destinationWarehouse: transfer.destinationWarehouse,
      destinationLocation: transfer.destinationLocation,
    })),
    inventoryByWarehouse,
    movementTotalsByType: movementTotals,
  };
};

const reports = {
  inventory: inventoryReport,
  warehouseInventory: warehouseInventoryReport,
  lowStock: lowStockReport,
  stockMovements: movementReport,
  transfers: transferReport,
};

module.exports = {
  dashboardSummary,
  ...reports,
};
