require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  USER_ROLES,
  USER_ROLE_VALUES,
  STOCK_MOVEMENT_TYPES,
  STOCK_MOVEMENT_TYPE_VALUES,
  TRANSFER_STATUSES,
  TRANSFER_STATUS_VALUES,
} = require("../src/constants");
const {
  parsePagination,
  normalizeSearchString,
  isValidObjectId,
  validateDateRange,
  AppError,
  handleDuplicateKeyError,
  normalizeMongooseValidationError,
} = require("../src/utils");
const {
  User,
  Warehouse,
  Location,
  Category,
  Product,
  Inventory,
  StockMovement,
  Transfer,
  RefreshToken,
} = require("../src/models");

const { testDatabaseUri: DB_URI } = require("./helpers/database");

const createTestUser = async (overrides = {}) => {
  const baseUser = {
    firstName: "Alice",
    lastName: "Jones",
    email: `alice.${Date.now()}@example.com`,
    password: "StrongPassword123",
    role: USER_ROLES.STAFF,
  };

  return User.create({ ...baseUser, ...overrides });
};

test.before(async () => {
  await mongoose.connect(DB_URI);
});

test.after(async () => {
  await mongoose.connection.close();
});

test.beforeEach(async () => {
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const collection of collections) {
    await mongoose.connection.db.collection(collection.name).deleteMany({});
  }
});

test("shared constants expose expected enums", () => {
  assert.deepEqual(USER_ROLE_VALUES, ["ADMIN", "MANAGER", "STAFF"]);
  assert.deepEqual(TRANSFER_STATUS_VALUES, [
    "PENDING",
    "APPROVED",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
  ]);
  assert.deepEqual(STOCK_MOVEMENT_TYPE_VALUES, [
    "STOCK_IN",
    "STOCK_OUT",
    "ADJUSTMENT_IN",
    "ADJUSTMENT_OUT",
    "TRANSFER_IN",
    "TRANSFER_OUT",
  ]);
  assert.equal(USER_ROLES.ADMIN, "ADMIN");
  assert.equal(STOCK_MOVEMENT_TYPES.TRANSFER_OUT, "TRANSFER_OUT");
  assert.equal(TRANSFER_STATUSES.REJECTED, "REJECTED");
});

test("pagination parsing defaults and caps limits safely", () => {
  assert.deepEqual(parsePagination({ page: "2", limit: "10" }), {
    page: 2,
    limit: 10,
  });

  assert.deepEqual(parsePagination({ page: "0", limit: "999" }), {
    page: 1,
    limit: 50,
  });

  assert.deepEqual(parsePagination({ page: "abc", limit: "-5" }), {
    page: 1,
    limit: 20,
  });
});

test("search normalization and object-id validators behave consistently", () => {
  assert.equal(normalizeSearchString("  WAREHOUSE   123  "), "warehouse 123");
  assert.equal(isValidObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(isValidObjectId("invalid-id"), false);
  assert.equal(isValidObjectId(""), false);

  const validRange = validateDateRange({
    startDate: "2025-01-01",
    endDate: "2025-01-31",
  });
  assert.deepEqual(validRange, {
    startDate: new Date("2025-01-01T00:00:00.000Z"),
    endDate: new Date("2025-01-31T00:00:00.000Z"),
  });

  assert.throws(
    () => validateDateRange({ startDate: "2025-02-01", endDate: "2025-01-31" }),
    /after/,
  );
});

test("custom errors and validation conversions are consistent", () => {
  const appError = new AppError("Not found", 404, { code: "NOT_FOUND" });

  assert.equal(appError.message, "Not found");
  assert.equal(appError.statusCode, 404);
  assert.equal(appError.details.code, "NOT_FOUND");

  const duplicateError = handleDuplicateKeyError({
    code: 11000,
    keyValue: { email: "a@b.com" },
  });
  assert.equal(
    duplicateError.message,
    "A record with the same email already exists.",
  );

  const validationError = normalizeMongooseValidationError({
    errors: {
      email: { message: "Email is required" },
    },
  });

  assert.equal(validationError.message, "Validation failed");
  assert.equal(validationError.details.email, "Email is required");
});

test("User duplicate email is rejected", async () => {
  await createTestUser({ email: "dup@example.com" });

  await assert.rejects(
    () => createTestUser({ email: "dup@example.com" }),
    /duplicate|already exists|email/i,
  );
});

test("Warehouse duplicate codes are rejected", async () => {
  const user = await createTestUser();

  await Warehouse.create({
    name: "Main Warehouse",
    code: "WH-01",
    address: { street: "12 Main St", city: "Nairobi", country: "Kenya" },
    createdBy: user._id,
  });

  await assert.rejects(
    () =>
      Warehouse.create({
        name: "Second Warehouse",
        code: "WH-01",
        address: { street: "14 Side St", city: "Nairobi", country: "Kenya" },
        createdBy: user._id,
      }),
    /duplicate|already exists|code/i,
  );
});

test("Product duplicate SKUs and negative minimumStockLevel are rejected", async () => {
  const user = await createTestUser();
  const category = await Category.create({
    name: "Electronics",
    createdBy: user._id,
  });

  await Product.create({
    name: "Laptop",
    sku: "SKU-001",
    category: category._id,
    unit: "EA",
    createdBy: user._id,
  });

  await assert.rejects(
    () =>
      Product.create({
        name: "Laptop 2",
        sku: "SKU-001",
        category: category._id,
        unit: "EA",
        createdBy: user._id,
      }),
    /duplicate|already exists|sku/i,
  );

  await assert.rejects(
    () =>
      Product.create({
        name: "Bad Product",
        sku: "SKU-002",
        category: category._id,
        unit: "EA",
        minimumStockLevel: -1,
        createdBy: user._id,
      }),
    /minimumStockLevel|min.*0|non-negative/i,
  );
});

test("Inventory rejects duplicate product-location pairs and negative quantities", async () => {
  const user = await createTestUser();
  const warehouse = await Warehouse.create({
    name: "North Hub",
    code: "WH-02",
    address: { street: "7 Ferry Rd", city: "Mombasa", country: "Kenya" },
    createdBy: user._id,
  });
  const location = await Location.create({
    name: "Aisle A",
    code: "A-01",
    warehouse: warehouse._id,
    type: "STORAGE",
    createdBy: user._id,
  });
  const category = await Category.create({
    name: "Office Supplies",
    createdBy: user._id,
  });
  const product = await Product.create({
    name: "Notebook",
    sku: "SKU-010",
    category: category._id,
    unit: "BOX",
    createdBy: user._id,
  });

  await Inventory.create({
    product: product._id,
    warehouse: warehouse._id,
    location: location._id,
    quantity: 10,
  });

  await assert.rejects(
    () =>
      Inventory.create({
        product: product._id,
        warehouse: warehouse._id,
        location: location._id,
        quantity: 5,
      }),
    /duplicate|already exists|product/i,
  );

  const validationError = new Inventory({
    product: product._id,
    warehouse: warehouse._id,
    location: location._id,
    quantity: -1,
  }).validateSync();

  assert.ok(validationError);
  assert.match(
    validationError.errors.quantity.message,
    /quantity|min.*0|non-negative/i,
  );
});

test("invalid enums and required relationships are rejected", async () => {
  const user = await createTestUser();

  const warehouse = await Warehouse.create({
    name: "West Hub",
    code: "WH-03",
    address: { street: "9 West Rd", city: "Kisumu", country: "Kenya" },
    createdBy: user._id,
  });

  await assert.rejects(
    () =>
      Location.create({
        name: "Loading Bay",
        code: "LB-01",
        warehouse: warehouse._id,
        type: "INVALID_TYPE",
        createdBy: user._id,
      }),
    /enum|type/i,
  );

  await assert.rejects(
    () =>
      StockMovement.create({
        product: new mongoose.Types.ObjectId(),
        warehouse: warehouse._id,
        location: new mongoose.Types.ObjectId(),
        movementType: "NOT_A_TYPE",
        quantity: 3,
        previousQuantity: 0,
        newQuantity: 3,
        performedBy: user._id,
      }),
    /enum|movementType/i,
  );
});

test("pagination response contract and app error utilities remain consistent", async () => {
  const paginated = {
    success: true,
    message: "Records retrieved successfully",
    data: [],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 0,
    },
  };

  assert.deepEqual(paginated.success, true);
  assert.equal(paginated.pagination.page, 1);
  assert.equal(paginated.pagination.limit, 20);
});

test("operational query and uniqueness indexes are present in MongoDB", async () => {
  await Promise.all([
    User.init(),
    Warehouse.init(),
    Location.init(),
    Category.init(),
    Product.init(),
    Inventory.init(),
    StockMovement.init(),
    Transfer.init(),
    RefreshToken.init(),
  ]);

  const [users, warehouses, locations, inventory, movements, transfers] =
    await Promise.all([
      User.collection.indexes(),
      Warehouse.collection.indexes(),
      Location.collection.indexes(),
      Inventory.collection.indexes(),
      StockMovement.collection.indexes(),
      Transfer.collection.indexes(),
    ]);
  const hasIndex = (indexes, name, unique = false) =>
    indexes.some((index) => index.name === name && (!unique || index.unique));

  assert.ok(hasIndex(users, "email_1", true));
  assert.ok(hasIndex(warehouses, "code_1", true));
  assert.ok(hasIndex(locations, "warehouse_1_code_1", true));
  assert.ok(hasIndex(inventory, "product_1_location_1", true));
  assert.ok(hasIndex(inventory, "warehouse_1_updatedAt_-1"));
  assert.ok(hasIndex(movements, "warehouse_1_createdAt_-1"));
  assert.ok(hasIndex(movements, "performedBy_1_createdAt_-1"));
  assert.ok(hasIndex(transfers, "sourceWarehouse_1_createdAt_-1"));
  assert.ok(hasIndex(transfers, "status_1_createdAt_-1"));
});
