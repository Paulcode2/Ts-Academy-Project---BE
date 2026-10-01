const crypto = require("node:crypto");
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
  validateDateRange,
} = require("../utils");
const { STOCK_MOVEMENT_TYPES, TRANSFER_STATUSES } = require("../constants");

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseId = (value, field) => {
  if (!isValidObjectId(value)) {
    throw new AppError(`Invalid ${field}.`, 400, { field });
  }
  return new mongoose.Types.ObjectId(value);
};

const getWarehouse = async (id, session) =>
  Warehouse.findById(id)
    .select("_id manager isActive")
    .session(session || null)
    .lean();

const hasWarehouseAccess = async (user, warehouseId) => {
  if (user.role === "ADMIN") return true;
  const warehouse = await getWarehouse(warehouseId);
  if (!warehouse) return false;
  return (
    String(warehouse.manager || "") === String(user._id) ||
    (user.assignedWarehouses || []).some(
      (assignedId) => String(assignedId) === String(warehouseId),
    )
  );
};

const assertWarehouseAccess = async (user, warehouseId) => {
  const warehouse = await getWarehouse(warehouseId);
  if (!warehouse) throw new AppError("Warehouse not found.", 404);
  if (!(await hasWarehouseAccess(user, warehouseId))) {
    throw new AppError("Access denied for this warehouse.", 403);
  }
  return warehouse;
};

const assertTransferAccess = async (user, transfer, action = "read") => {
  if (user.role === "ADMIN") return;
  if (
    action === "read" &&
    String(transfer.initiatedBy) === String(user._id)
  ) {
    return;
  }
  const canAccessSource = await hasWarehouseAccess(user, transfer.sourceWarehouse);
  const canAccessDestination = await hasWarehouseAccess(
    user,
    transfer.destinationWarehouse,
  );
  if (action === "cancel" && String(transfer.initiatedBy) === String(user._id)) {
    return;
  }
  if (!canAccessSource && !canAccessDestination) {
    throw new AppError("Access denied for this transfer.", 403);
  }
};

const assertManagerOrAdmin = async (user, transfer) => {
  if (!["ADMIN", "MANAGER"].includes(user.role)) {
    throw new AppError("Access denied.", 403);
  }
  await assertTransferAccess(user, transfer, "manage");
};

const requireActiveResources = async (transferInput, session) => {
  const [product, sourceWarehouse, destinationWarehouse, sourceLocation, destinationLocation] =
    await Promise.all([
      Product.findOne({ _id: transferInput.product, isActive: true })
        .select("_id name sku")
        .session(session)
        .lean(),
      Warehouse.findOne({ _id: transferInput.sourceWarehouse, isActive: true })
        .select("_id")
        .session(session)
        .lean(),
      Warehouse.findOne({
        _id: transferInput.destinationWarehouse,
        isActive: true,
      })
        .select("_id")
        .session(session)
        .lean(),
      Location.findOne({
        _id: transferInput.sourceLocation,
        warehouse: transferInput.sourceWarehouse,
        isActive: true,
      })
        .select("_id warehouse")
        .session(session)
        .lean(),
      Location.findOne({
        _id: transferInput.destinationLocation,
        warehouse: transferInput.destinationWarehouse,
        isActive: true,
      })
        .select("_id warehouse")
        .session(session)
        .lean(),
    ]);

  if (!product) throw new AppError("Active product not found.", 404);
  if (!sourceWarehouse) throw new AppError("Active source warehouse not found.", 404);
  if (!destinationWarehouse) {
    throw new AppError("Active destination warehouse not found.", 404);
  }
  if (!sourceLocation) {
    const found = await Location.findById(transferInput.sourceLocation)
      .select("_id warehouse")
      .session(session)
      .lean();
    if (found && String(found.warehouse) !== String(transferInput.sourceWarehouse)) {
      throw new AppError("Source location does not belong to the source warehouse.", 400);
    }
    throw new AppError("Active source location not found.", 404);
  }
  if (!destinationLocation) {
    const found = await Location.findById(transferInput.destinationLocation)
      .select("_id warehouse")
      .session(session)
      .lean();
    if (
      found &&
      String(found.warehouse) !== String(transferInput.destinationWarehouse)
    ) {
      throw new AppError(
        "Destination location does not belong to the destination warehouse.",
        400,
      );
    }
    throw new AppError("Active destination location not found.", 404);
  }
  if (String(transferInput.sourceLocation) === String(transferInput.destinationLocation)) {
    throw new AppError("Source and destination must be different locations.", 400);
  }
  return { product };
};

const normalizeCreateInput = (body) => {
  const product = parseId(body.productId, "productId");
  const sourceWarehouse = parseId(body.sourceWarehouseId, "sourceWarehouseId");
  const sourceLocation = parseId(body.sourceLocationId, "sourceLocationId");
  const destinationWarehouse = parseId(
    body.destinationWarehouseId,
    "destinationWarehouseId",
  );
  const destinationLocation = parseId(
    body.destinationLocationId,
    "destinationLocationId",
  );
  const requestedQuantity = body.quantity;
  const quantity = Number(requestedQuantity);
  if (
    requestedQuantity === undefined ||
    requestedQuantity === null ||
    !["number", "string"].includes(typeof requestedQuantity) ||
    String(requestedQuantity).trim() === "" ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw new AppError("quantity must be a positive number.", 400, {
      field: "quantity",
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
    product,
    quantity,
    sourceWarehouse,
    sourceLocation,
    destinationWarehouse,
    destinationLocation,
    reference: reference || `TR-${crypto.randomUUID()}`,
    notes,
  };
};

const createTransfer = async (req) => {
  const input = normalizeCreateInput(req.body || {});
  await assertWarehouseAccess(req.user, input.sourceWarehouse);
  const { product } = await requireActiveResources(input);
  const sourceInventory = await Inventory.findOne({
    product: input.product,
    warehouse: input.sourceWarehouse,
    location: input.sourceLocation,
  })
    .select("quantity")
    .lean();
  if (!sourceInventory || sourceInventory.quantity < input.quantity) {
    throw new AppError("Insufficient stock.", 409, {
      availableQuantity: sourceInventory?.quantity || 0,
      requestedQuantity: input.quantity,
    });
  }

  const transfer = await Transfer.create({
    ...input,
    status: TRANSFER_STATUSES.PENDING,
    initiatedBy: req.user._id,
  });
  return toTransferResponse(transfer.toObject(), product);
};

const referenceValue = (value, fields = []) => {
  if (value === null || value === undefined) return value;
  if (value?._bsontype === "ObjectId") return String(value);
  if (!value._id) return String(value);
  const result = { id: String(value._id) };
  for (const field of fields) {
    if (value[field] !== undefined) result[field] = value[field];
  }
  return result;
};

const toTransferResponse = (transfer, product) => ({
  id: String(transfer._id),
  reference: transfer.reference,
  product: transfer.product?._id && transfer.product?._bsontype !== "ObjectId"
    ? referenceValue(transfer.product, ["name", "sku", "unit"])
    : product
      ? referenceValue(product, ["name", "sku"])
      : String(transfer.product),
  quantity: transfer.quantity,
  sourceWarehouse: referenceValue(transfer.sourceWarehouse, ["name", "code"]),
  sourceLocation: referenceValue(transfer.sourceLocation, ["name", "code"]),
  destinationWarehouse: referenceValue(transfer.destinationWarehouse, ["name", "code"]),
  destinationLocation: referenceValue(transfer.destinationLocation, ["name", "code"]),
  status: transfer.status,
  initiatedBy: referenceValue(transfer.initiatedBy, ["firstName", "lastName"]),
  approvedBy: referenceValue(transfer.approvedBy, ["firstName", "lastName"]),
  completedBy: referenceValue(transfer.completedBy, ["firstName", "lastName"]),
  rejectedBy: referenceValue(transfer.rejectedBy, ["firstName", "lastName"]),
  cancelledBy: referenceValue(transfer.cancelledBy, ["firstName", "lastName"]),
  notes: transfer.notes,
  rejectionReason: transfer.rejectionReason,
  approvedAt: transfer.approvedAt,
  completedAt: transfer.completedAt,
  rejectedAt: transfer.rejectedAt,
  cancelledAt: transfer.cancelledAt,
  createdAt: transfer.createdAt,
  updatedAt: transfer.updatedAt,
});

const populateTransfer = (transferQuery) =>
  transferQuery
    .select("-__v")
    .populate({ path: "product", select: "name sku unit" })
    .populate({ path: "sourceWarehouse", select: "name code" })
    .populate({ path: "sourceLocation", select: "name code" })
    .populate({ path: "destinationWarehouse", select: "name code" })
    .populate({ path: "destinationLocation", select: "name code" })
    .populate({ path: "initiatedBy", select: "firstName lastName" })
    .populate({ path: "approvedBy", select: "firstName lastName" })
    .populate({ path: "completedBy", select: "firstName lastName" })
    .populate({ path: "rejectedBy", select: "firstName lastName" })
    .populate({ path: "cancelledBy", select: "firstName lastName" });

const buildTransferFilter = async (user, query) => {
  const filter = {};
  const status = query.status;
  if (status) {
    if (!Object.values(TRANSFER_STATUSES).includes(status)) {
      throw new AppError("Invalid transfer status.", 400, { field: "status" });
    }
    filter.status = status;
  }
  const ids = [
    ["product", "product"],
    ["sourceWarehouse", "sourceWarehouse"],
    ["destinationWarehouse", "destinationWarehouse"],
    ["initiatedBy", "initiatedBy"],
  ];
  for (const [parameter, field] of ids) {
    if (query[parameter]) filter[field] = parseId(query[parameter], parameter);
  }
  if (query.reference) {
    filter.reference = {
      $regex: escapeRegex(String(query.reference).trim()),
      $options: "i",
    };
  }
  if (query.warehouse) {
    const warehouseId = parseId(query.warehouse, "warehouse");
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { sourceWarehouse: warehouseId },
          { destinationWarehouse: warehouseId },
        ],
      },
    ];
  }
  try {
    const range = validateDateRange({
      startDate: query.startDate,
      endDate: query.endDate,
    });
    if (range.startDate || range.endDate) {
      filter.createdAt = {};
      if (range.startDate) filter.createdAt.$gte = range.startDate;
      if (range.endDate) filter.createdAt.$lte = range.endDate;
    }
  } catch (error) {
    throw new AppError(error.message, 400);
  }
  if (user.role !== "ADMIN") {
    const accessible = new Set((user.assignedWarehouses || []).map(String));
    const managed = await Warehouse.find({ manager: user._id }).distinct("_id");
    managed.forEach((id) => accessible.add(String(id)));
    const accessibleIds = [...accessible].map((id) => new mongoose.Types.ObjectId(id));
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { sourceWarehouse: { $in: accessibleIds } },
          { destinationWarehouse: { $in: accessibleIds } },
          { initiatedBy: user._id },
        ],
      },
    ];
  }
  return filter;
};

const listTransfers = async (req) => {
  const { page, limit } = parsePagination(req.query);
  const filter = await buildTransferFilter(req.user, req.query);
  const sortField = String(req.query.sort || "-createdAt");
  const descending = sortField.startsWith("-");
  const field = descending ? sortField.slice(1) : sortField;
  if (!["createdAt", "updatedAt", "reference", "status", "quantity"].includes(field)) {
    throw new AppError("Unsupported sort field.", 400, { field: "sort" });
  }
  const sort = { [field]: descending ? -1 : 1, _id: 1 };
  const [totalItems, transfers] = await Promise.all([
    Transfer.countDocuments(filter),
    populateTransfer(
      Transfer.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
    ).lean(),
  ]);
  return buildPaginatedResponse({
    data: transfers.map((transfer) => toTransferResponse(transfer)),
    page,
    limit,
    totalItems,
  });
};

const getTransferRecord = async (id) => {
  const transferId = parseId(id, "transferId");
  const transfer = await Transfer.findById(transferId).select("-__v").lean();
  if (!transfer) throw new AppError("Transfer not found.", 404);
  return transfer;
};

const getTransfer = async (req) => {
  const transfer = await getTransferRecord(req.params.transferId);
  await assertTransferAccess(req.user, transfer);
  const populated = await populateTransfer(Transfer.findById(transfer._id)).lean();
  return toTransferResponse(populated);
};

const transitionPending = async (req, nextStatus, fields = {}) => {
  const transfer = await getTransferRecord(req.params.transferId);
  await assertManagerOrAdmin(req.user, transfer);
  if (transfer.status !== TRANSFER_STATUSES.PENDING) {
    throw new AppError(`Transfer cannot transition from ${transfer.status}.`, 409);
  }
  const updated = await Transfer.findOneAndUpdate(
    { _id: transfer._id, status: TRANSFER_STATUSES.PENDING },
    { $set: { status: nextStatus, ...fields } },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) {
    throw new AppError("Transfer state changed; refresh and retry.", 409);
  }
  return toTransferResponse(updated);
};

const approveTransfer = async (req) =>
  transitionPending(req, TRANSFER_STATUSES.APPROVED, {
    approvedBy: req.user._id,
    approvedAt: new Date(),
  });

const rejectTransfer = async (req) => {
  const rejectionReason = String(req.body?.rejectionReason || "").trim();
  if (!rejectionReason || rejectionReason.length > 500) {
    throw new AppError(
      "rejectionReason is required and cannot exceed 500 characters.",
      400,
      { field: "rejectionReason" },
    );
  }
  return transitionPending(req, TRANSFER_STATUSES.REJECTED, {
    rejectedBy: req.user._id,
    rejectedAt: new Date(),
    rejectionReason,
  });
};

const cancelTransfer = async (req) => {
  const transfer = await getTransferRecord(req.params.transferId);
  await assertTransferAccess(req.user, transfer, "cancel");
  if (![TRANSFER_STATUSES.PENDING, TRANSFER_STATUSES.APPROVED].includes(transfer.status)) {
    throw new AppError(`Transfer cannot transition from ${transfer.status}.`, 409);
  }
  if (
    req.user.role !== "ADMIN" &&
    req.user.role !== "MANAGER" &&
    String(transfer.initiatedBy) !== String(req.user._id)
  ) {
    throw new AppError("Access denied.", 403);
  }
  const updated = await Transfer.findOneAndUpdate(
    {
      _id: transfer._id,
      status: { $in: [TRANSFER_STATUSES.PENDING, TRANSFER_STATUSES.APPROVED] },
    },
    {
      $set: {
        status: TRANSFER_STATUSES.CANCELLED,
        cancelledBy: req.user._id,
        cancelledAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw new AppError("Transfer state changed; refresh and retry.", 409);
  return toTransferResponse(updated);
};

const isTransactionUnsupported = (error) =>
  error?.code === 20 ||
  /transaction numbers are only allowed|does not support transactions/i.test(
    error?.message || "",
  );

const completeTransfer = async (req) => {
  const transferId = parseId(req.params.transferId, "transferId");
  const transferBefore = await getTransferRecord(transferId);
  await assertManagerOrAdmin(req.user, transferBefore);
  if (transferBefore.status !== TRANSFER_STATUSES.APPROVED) {
    throw new AppError(
      `Only APPROVED transfers can be completed (current status: ${transferBefore.status}).`,
      409,
    );
  }

  const session = await mongoose.startSession();
  let completed;
  try {
    await session.withTransaction(async () => {
      const transfer = await Transfer.findOne({
        _id: transferId,
        status: TRANSFER_STATUSES.APPROVED,
      })
        .session(session)
        .lean();
      if (!transfer) {
        const current = await Transfer.findById(transferId)
          .select("status")
          .session(session)
          .lean();
        if (!current) throw new AppError("Transfer not found.", 404);
        throw new AppError(
          current.status === TRANSFER_STATUSES.COMPLETED
            ? "Transfer has already been completed."
            : `Only APPROVED transfers can be completed (current status: ${current.status}).`,
          409,
        );
      }
      await requireActiveResources(transfer, session);

      const source = await Inventory.findOne({
        product: transfer.product,
        warehouse: transfer.sourceWarehouse,
        location: transfer.sourceLocation,
      })
        .session(session)
        .lean();
      if (!source || source.quantity < transfer.quantity) {
        throw new AppError("Insufficient stock to complete transfer.", 409, {
          availableQuantity: source?.quantity || 0,
          requestedQuantity: transfer.quantity,
        });
      }
      const sourceUpdate = await Inventory.updateOne(
        {
          _id: source._id,
          quantity: { $gte: transfer.quantity },
        },
        { $inc: { quantity: -transfer.quantity } },
        { session, runValidators: true },
      );
      if (sourceUpdate.modifiedCount !== 1) {
        throw new AppError("Insufficient stock to complete transfer.", 409, {
          availableQuantity: source.quantity,
          requestedQuantity: transfer.quantity,
        });
      }
      const sourceNewQuantity = source.quantity - transfer.quantity;

      let destination = await Inventory.findOne({
        product: transfer.product,
        warehouse: transfer.destinationWarehouse,
        location: transfer.destinationLocation,
      })
        .session(session)
        .lean();
      const destinationPreviousQuantity = destination?.quantity || 0;
      if (destination) {
        const destinationUpdate = await Inventory.updateOne(
          {
            _id: destination._id,
            quantity: destinationPreviousQuantity,
          },
          { $inc: { quantity: transfer.quantity } },
          { session, runValidators: true },
        );
        if (destinationUpdate.modifiedCount !== 1) {
          throw new AppError("Destination inventory changed; retry completion.", 409);
        }
        destination = {
          ...destination,
          quantity: destinationPreviousQuantity + transfer.quantity,
        };
      } else {
        [destination] = await Inventory.create(
          [
            {
              product: transfer.product,
              warehouse: transfer.destinationWarehouse,
              location: transfer.destinationLocation,
              quantity: transfer.quantity,
            },
          ],
          { session },
        );
      }

      const movementBase = {
        product: transfer.product,
        relatedTransfer: transfer._id,
        quantity: transfer.quantity,
        reason: "Stock transfer",
        reference: transfer.reference,
        notes: transfer.notes,
        performedBy: req.user._id,
      };
      await StockMovement.create(
        [
          {
            ...movementBase,
            warehouse: transfer.sourceWarehouse,
            location: transfer.sourceLocation,
            movementType: STOCK_MOVEMENT_TYPES.TRANSFER_OUT,
            previousQuantity: source.quantity,
            newQuantity: sourceNewQuantity,
          },
          {
            ...movementBase,
            warehouse: transfer.destinationWarehouse,
            location: transfer.destinationLocation,
            movementType: STOCK_MOVEMENT_TYPES.TRANSFER_IN,
            previousQuantity: destinationPreviousQuantity,
            newQuantity: destinationPreviousQuantity + transfer.quantity,
          },
        ],
        { session },
      );

      const result = await Transfer.findOneAndUpdate(
        { _id: transfer._id, status: TRANSFER_STATUSES.APPROVED },
        {
          $set: {
            status: TRANSFER_STATUSES.COMPLETED,
            completedBy: req.user._id,
            completedAt: new Date(),
          },
        },
        { new: true, runValidators: true, session },
      ).lean();
      if (!result) {
        throw new AppError("Transfer state changed; refresh and retry.", 409);
      }
      completed = {
        transfer: toTransferResponse(result),
        stock: {
          source: {
            inventoryId: String(source._id),
            quantity: sourceNewQuantity,
          },
          destination: {
            inventoryId: String(destination._id),
            quantity: destinationPreviousQuantity + transfer.quantity,
          },
        },
      };
    });
    return completed;
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      throw new AppError(
        "Transfer completion requires MongoDB transactions. Configure MongoDB as a replica set or sharded cluster.",
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  createTransfer,
  listTransfers,
  getTransfer,
  approveTransfer,
  rejectTransfer,
  cancelTransfer,
  completeTransfer,
};
