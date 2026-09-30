const { Warehouse, Location, Category, Product, User } = require("../models");
const {
  AppError,
  buildPaginatedResponse,
  parsePagination,
  isValidObjectId,
} = require("../utils");

const LOCATION_TYPES = [
  "STORAGE",
  "PICKING",
  "RECEIVING",
  "QUARANTINE",
  "RETURN",
  "COLD_STORAGE",
];
const PRODUCT_UNITS = [
  "EA",
  "BOX",
  "CASE",
  "PALLET",
  "KG",
  "L",
  "SET",
  "BUNDLE",
];

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validateId = (id, fieldName) => {
  if (!isValidObjectId(id)) {
    throw new AppError(`Invalid ${fieldName}.`, 400, { field: fieldName });
  }
};

const getIdParam = (req, param) => {
  const id = req.params[param];
  validateId(id, param);
  return id;
};

const getAccessibleWarehouseIds = async (user) => {
  if (user.role === "ADMIN") return null;

  const ids = new Set((user.assignedWarehouses || []).map(String));
  const managedIds = await Warehouse.find({ manager: user._id }).distinct(
    "_id",
  );
  managedIds.forEach((id) => ids.add(String(id)));
  return [...ids];
};

const assertWarehouseAccess = async (user, warehouseId) => {
  validateId(warehouseId, "warehouseId");
  const warehouse = await Warehouse.findById(warehouseId)
    .select("_id manager isActive")
    .lean();

  if (!warehouse) throw new AppError("Warehouse not found.", 404);
  if (user.role === "ADMIN") return warehouse;

  const assigned = (user.assignedWarehouses || []).some(
    (id) => String(id) === String(warehouse._id),
  );
  const manager = String(warehouse.manager || "") === String(user._id);
  if (!assigned && !manager) {
    throw new AppError("Access denied for this warehouse.", 403);
  }

  return warehouse;
};

const activeStatusFilter = (query) => {
  const status = query.status;
  const isActive = query.isActive;

  if (status !== undefined) {
    if (!["active", "inactive", "all"].includes(String(status).toLowerCase())) {
      throw new AppError("Status must be active, inactive, or all.", 400, {
        field: "status",
      });
    }
    if (String(status).toLowerCase() !== "all") {
      return { isActive: String(status).toLowerCase() === "active" };
    }
    return null;
  }

  if (isActive !== undefined) {
    if (!["true", "false"].includes(String(isActive).toLowerCase())) {
      throw new AppError("isActive must be true or false.", 400, {
        field: "isActive",
      });
    }
    return { isActive: String(isActive).toLowerCase() === "true" };
  }

  return null;
};

const combineFilters = (...filters) => {
  const present = filters.filter(Boolean);
  if (present.length === 0) return {};
  if (present.length === 1) return present[0];
  return { $and: present };
};

const listRecords = async ({
  model,
  query,
  filters,
  searchFields,
  sortFields,
}) => {
  const { page, limit } = parsePagination(query);
  const search = String(query.search || "").trim();
  const searchFilter = search
    ? {
        $or: searchFields.map((field) => ({
          [field]: { $regex: escapeRegex(search), $options: "i" },
        })),
      }
    : null;
  const criteria = combineFilters(
    filters,
    activeStatusFilter(query),
    searchFilter,
  );
  if (query.sortBy && !sortFields.includes(query.sortBy)) {
    throw new AppError("Unsupported sort field.", 400, { field: "sortBy" });
  }
  const requestedSortOrder = String(query.sortOrder || "desc").toLowerCase();
  if (!["asc", "desc"].includes(requestedSortOrder)) {
    throw new AppError("sortOrder must be asc or desc.", 400, {
      field: "sortOrder",
    });
  }
  const sortBy = query.sortBy || "createdAt";
  const sortOrder = requestedSortOrder === "asc" ? 1 : -1;
  const [totalItems, records] = await Promise.all([
    model.countDocuments(criteria),
    model
      .find(criteria)
      .select("-__v")
      .sort({ [sortBy]: sortOrder, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return buildPaginatedResponse({
    data: records,
    page,
    limit,
    totalItems,
  });
};

const getRecord = async (model, id, fieldName) => {
  validateId(id, fieldName);
  const record = await model.findById(id).select("-__v").lean();
  if (!record)
    throw new AppError(`${fieldName.replace("Id", "")} not found.`, 404);
  return record;
};

const pickUpdates = (body, allowedFields) => {
  const updates = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }
  if (!Object.keys(updates).length) {
    throw new AppError("No valid fields were provided.", 400);
  }
  return updates;
};

const validateManager = async (managerId) => {
  if (managerId === null || managerId === "") return null;
  validateId(managerId, "manager");
  const manager = await User.findOne({
    _id: managerId,
    role: "MANAGER",
    isActive: true,
  })
    .select("_id")
    .lean();
  if (!manager)
    throw new AppError("Manager must be an active MANAGER user.", 400, {
      field: "manager",
    });
  return manager._id;
};

const saveUpdates = async (model, id, updates, userId, fieldName) => {
  const record = await model.findById(id);
  if (!record) throw new AppError(`${fieldName} not found.`, 404);
  Object.assign(record, updates, { updatedBy: userId });
  await record.save();
  return record.toJSON();
};

const setStatus = async (model, id, isActive, userId, fieldName) => {
  if (typeof isActive !== "boolean") {
    throw new AppError("isActive must be a boolean.", 400, {
      field: "isActive",
    });
  }
  return saveUpdates(model, id, { isActive }, userId, fieldName);
};

const createWarehouse = async (req) => {
  const payload = pickUpdates(req.body, [
    "name",
    "code",
    "address",
    "description",
    "manager",
  ]);
  if (payload.manager !== undefined)
    payload.manager = await validateManager(payload.manager);
  if (payload.code !== undefined)
    payload.code = String(payload.code).trim().toUpperCase();
  const warehouse = await Warehouse.create({
    ...payload,
    createdBy: req.user._id,
  });
  return warehouse.toJSON();
};

const listWarehouses = async (req) => {
  const accessibleIds = await getAccessibleWarehouseIds(req.user);
  const scope = accessibleIds === null ? null : { _id: { $in: accessibleIds } };
  return listRecords({
    model: Warehouse,
    query: req.query,
    filters: scope,
    searchFields: ["name", "code"],
    sortFields: ["name", "code", "createdAt", "updatedAt"],
  });
};

const getWarehouse = async (req) => {
  const id = getIdParam(req, "warehouseId");
  await assertWarehouseAccess(req.user, id);
  return getRecord(Warehouse, id, "warehouseId");
};

const updateWarehouse = async (req) => {
  const id = getIdParam(req, "warehouseId");
  const updates = pickUpdates(req.body, [
    "name",
    "code",
    "address",
    "description",
    "manager",
  ]);
  if (updates.code !== undefined)
    updates.code = String(updates.code).trim().toUpperCase();
  if (updates.manager !== undefined)
    updates.manager = await validateManager(updates.manager);
  return saveUpdates(Warehouse, id, updates, req.user._id, "Warehouse");
};

const setWarehouseStatus = async (req) =>
  setStatus(
    Warehouse,
    getIdParam(req, "warehouseId"),
    req.body.isActive,
    req.user._id,
    "Warehouse",
  );

const assertLocationWarehouse = async (user, warehouseId) => {
  const warehouse = await assertWarehouseAccess(user, warehouseId);
  if (!warehouse.isActive)
    throw new AppError(
      "Locations can only belong to an active warehouse.",
      400,
    );
  return warehouse;
};

const createLocation = async (req) => {
  const payload = pickUpdates(req.body, [
    "name",
    "code",
    "warehouse",
    "type",
    "description",
  ]);
  await assertLocationWarehouse(req.user, payload.warehouse);
  if (payload.code !== undefined)
    payload.code = String(payload.code).trim().toUpperCase();
  const location = await Location.create({
    ...payload,
    createdBy: req.user._id,
  });
  return location.toJSON();
};

const locationScope = async (req) => {
  const requestedWarehouse = req.query.warehouseId || req.query.warehouse;
  if (requestedWarehouse)
    await assertWarehouseAccess(req.user, requestedWarehouse);

  const accessibleIds = await getAccessibleWarehouseIds(req.user);
  const warehouseFilter = requestedWarehouse
    ? { warehouse: requestedWarehouse }
    : accessibleIds === null
      ? null
      : { warehouse: { $in: accessibleIds } };
  const filters = [warehouseFilter];
  const type = req.query.type;
  if (type !== undefined) {
    if (!LOCATION_TYPES.includes(type))
      throw new AppError("Invalid location type.", 400, { field: "type" });
    filters.push({ type });
  }
  return combineFilters(...filters);
};

const listLocations = async (req) =>
  listRecords({
    model: Location,
    query: req.query,
    filters: await locationScope(req),
    searchFields: ["name", "code"],
    sortFields: ["name", "code", "createdAt", "updatedAt"],
  });

const getLocation = async (req) => {
  const id = getIdParam(req, "locationId");
  const location = await getRecord(Location, id, "locationId");
  await assertWarehouseAccess(req.user, location.warehouse);
  return location;
};

const updateLocation = async (req) => {
  const id = getIdParam(req, "locationId");
  const current = await Location.findById(id).select("warehouse").lean();
  if (!current) throw new AppError("Location not found.", 404);
  await assertWarehouseAccess(req.user, current.warehouse);
  const updates = pickUpdates(req.body, [
    "name",
    "code",
    "warehouse",
    "type",
    "description",
  ]);
  if (updates.warehouse !== undefined)
    await assertLocationWarehouse(req.user, updates.warehouse);
  if (updates.code !== undefined)
    updates.code = String(updates.code).trim().toUpperCase();
  return saveUpdates(Location, id, updates, req.user._id, "Location");
};

const setLocationStatus = async (req) => {
  const id = getIdParam(req, "locationId");
  const location = await Location.findById(id).select("warehouse").lean();
  if (!location) throw new AppError("Location not found.", 404);
  await assertWarehouseAccess(req.user, location.warehouse);
  if (req.body.isActive === true) {
    await assertLocationWarehouse(req.user, location.warehouse);
  }
  return setStatus(Location, id, req.body.isActive, req.user._id, "Location");
};

const findDuplicateCategoryName = async (name, exceptId) => {
  const criteria = {
    name: { $regex: `^${escapeRegex(String(name).trim())}$`, $options: "i" },
  };
  if (exceptId) criteria._id = { $ne: exceptId };
  return Category.exists(criteria);
};

const createCategory = async (req) => {
  const payload = pickUpdates(req.body, ["name", "description"]);
  if (await findDuplicateCategoryName(payload.name)) {
    throw new AppError("A category with the same name already exists.", 409, {
      field: "name",
    });
  }
  return (
    await Category.create({ ...payload, createdBy: req.user._id })
  ).toJSON();
};

const listCategories = async (req) =>
  listRecords({
    model: Category,
    query: req.query,
    filters: null,
    searchFields: ["name", "description"],
    sortFields: ["name", "createdAt", "updatedAt"],
  });

const getCategory = async (req) =>
  getRecord(Category, getIdParam(req, "categoryId"), "categoryId");

const updateCategory = async (req) => {
  const id = getIdParam(req, "categoryId");
  const updates = pickUpdates(req.body, ["name", "description"]);
  if (
    updates.name !== undefined &&
    (await findDuplicateCategoryName(updates.name, id))
  ) {
    throw new AppError("A category with the same name already exists.", 409, {
      field: "name",
    });
  }
  return saveUpdates(Category, id, updates, req.user._id, "Category");
};

const setCategoryStatus = async (req) =>
  setStatus(
    Category,
    getIdParam(req, "categoryId"),
    req.body.isActive,
    req.user._id,
    "Category",
  );

const validateActiveCategory = async (categoryId) => {
  validateId(categoryId, "category");
  const category = await Category.findOne({ _id: categoryId, isActive: true })
    .select("_id")
    .lean();
  if (!category)
    throw new AppError("Category must exist and be active.", 400, {
      field: "category",
    });
};

const createProduct = async (req) => {
  const payload = pickUpdates(req.body, [
    "name",
    "sku",
    "category",
    "unit",
    "description",
    "minimumStockLevel",
  ]);
  await validateActiveCategory(payload.category);
  if (payload.sku !== undefined)
    payload.sku = String(payload.sku).trim().toUpperCase();
  return (
    await Product.create({ ...payload, createdBy: req.user._id })
  ).toJSON();
};

const listProducts = async (req) => {
  const filters = [];
  if (req.query.category) {
    validateId(req.query.category, "category");
    filters.push({ category: req.query.category });
  }
  if (req.query.unit) {
    if (!PRODUCT_UNITS.includes(req.query.unit))
      throw new AppError("Invalid product unit.", 400, { field: "unit" });
    filters.push({ unit: req.query.unit });
  }
  return listRecords({
    model: Product,
    query: req.query,
    filters: combineFilters(...filters),
    searchFields: ["name", "sku"],
    sortFields: ["name", "sku", "createdAt", "updatedAt", "minimumStockLevel"],
  });
};

const getProduct = async (req) =>
  getRecord(Product, getIdParam(req, "productId"), "productId");

const updateProduct = async (req) => {
  const id = getIdParam(req, "productId");
  const updates = pickUpdates(req.body, [
    "name",
    "sku",
    "category",
    "unit",
    "description",
    "minimumStockLevel",
  ]);
  if (updates.category !== undefined)
    await validateActiveCategory(updates.category);
  if (updates.sku !== undefined)
    updates.sku = String(updates.sku).trim().toUpperCase();
  return saveUpdates(Product, id, updates, req.user._id, "Product");
};

const setProductStatus = async (req) => {
  const id = getIdParam(req, "productId");
  if (req.body.isActive === true) {
    const product = await Product.findById(id).select("category").lean();
    if (!product) throw new AppError("Product not found.", 404);
    await validateActiveCategory(product.category);
  }
  return setStatus(Product, id, req.body.isActive, req.user._id, "Product");
};

module.exports = {
  createWarehouse,
  listWarehouses,
  getWarehouse,
  updateWarehouse,
  setWarehouseStatus,
  createLocation,
  listLocations,
  getLocation,
  updateLocation,
  setLocationStatus,
  createCategory,
  listCategories,
  getCategory,
  updateCategory,
  setCategoryStatus,
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  setProductStatus,
};
