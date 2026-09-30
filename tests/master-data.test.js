const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = require("../src/app");
const {
  User,
  Warehouse,
  Location,
  Category,
  Product,
  Inventory,
  StockMovement,
  Transfer,
} = require("../src/models");

const DB_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/warehouse_management_test";
const accessSecret =
  process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me_1234567890";

const createUser = async (role, assignedWarehouses = []) =>
  User.create({
    firstName: "Master",
    lastName: "Data",
    email: `${role.toLowerCase()}.${Date.now()}.${Math.random()}@example.com`,
    password: "StrongPassword123!",
    role,
    assignedWarehouses,
  });

const withAuth = (user) => {
  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    accessSecret,
    { expiresIn: "15m" },
  );
  const authenticated = (method, url) =>
    request(app)[method](url).set("Authorization", `Bearer ${token}`);

  return {
    get: (url) => authenticated("get", url),
    post: (url) => authenticated("post", url),
    patch: (url) => authenticated("patch", url),
  };
};

const warehouseBody = (code = "WH-01") => ({
  name: "Main Warehouse",
  code,
  address: { street: "1 Main Street", city: "Nairobi", country: "Kenya" },
});

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

test("warehouse codes are normalized and duplicate codes are rejected", async () => {
  const admin = await createUser("ADMIN");
  const manager = await createUser("MANAGER");

  const created = await withAuth(admin)
    .post("/api/v1/warehouses")
    .send({ ...warehouseBody(" wh-a1 "), manager: manager._id })
    .expect(201);
  assert.equal(created.body.data.code, "WH-A1");
  assert.equal(created.body.data.createdBy, admin._id.toString());
  assert.equal(created.body.data.manager, manager._id.toString());

  const duplicate = await withAuth(admin)
    .post("/api/v1/warehouses")
    .send(warehouseBody("WH-A1"))
    .expect(409);
  assert.equal(duplicate.body.success, false);
});

test("location codes are unique within a warehouse and normalized", async () => {
  const admin = await createUser("ADMIN");
  const warehouseA = await Warehouse.create(warehouseBody("WH-A"));
  const warehouseB = await Warehouse.create(warehouseBody("WH-B"));
  const locationBody = (warehouse, code) => ({
    name: "Receiving",
    code,
    warehouse: warehouse._id.toString(),
    type: "RECEIVING",
  });

  const first = await withAuth(admin)
    .post("/api/v1/locations")
    .send(locationBody(warehouseA, "dock-1"))
    .expect(201);
  assert.equal(first.body.data.code, "DOCK-1");

  await withAuth(admin)
    .post("/api/v1/locations")
    .send(locationBody(warehouseA, "DOCK-1"))
    .expect(409);

  await withAuth(admin)
    .post("/api/v1/locations")
    .send(locationBody(warehouseB, "DOCK-1"))
    .expect(201);
});

test("inactive warehouses and categories cannot receive new master data", async () => {
  const admin = await createUser("ADMIN");
  const warehouse = await Warehouse.create({
    ...warehouseBody("WH-X"),
    isActive: false,
  });

  await withAuth(admin)
    .post("/api/v1/locations")
    .send({
      name: "Bin",
      code: "BIN-1",
      warehouse: warehouse._id,
      type: "STORAGE",
    })
    .expect(400);

  const category = await Category.create({
    name: "Inactive category",
    isActive: false,
  });
  await withAuth(admin)
    .post("/api/v1/products")
    .send({ name: "Widget", sku: "W-1", category: category._id, unit: "EA" })
    .expect(400);
});

test("product SKU is normalized and duplicate SKU is rejected", async () => {
  const admin = await createUser("ADMIN");
  const category = await Category.create({ name: "Tools" });
  const body = {
    name: "Hammer",
    sku: " h-01 ",
    category: category._id,
    unit: "EA",
  };

  const created = await withAuth(admin)
    .post("/api/v1/products")
    .send(body)
    .expect(201);
  assert.equal(created.body.data.sku, "H-01");

  await withAuth(admin)
    .post("/api/v1/products")
    .send({ ...body, sku: "H-01" })
    .expect(409);

  await withAuth(admin)
    .post("/api/v1/products")
    .send({ ...body, sku: "H-02", minimumStockLevel: -1 })
    .expect(400);
});

test("invalid warehouse and category references are rejected", async () => {
  const admin = await createUser("ADMIN");
  const unknownId = new mongoose.Types.ObjectId().toString();

  await withAuth(admin)
    .post("/api/v1/locations")
    .send({ name: "Bin", code: "BIN-1", warehouse: unknownId, type: "STORAGE" })
    .expect(404);
  await withAuth(admin)
    .post("/api/v1/products")
    .send({ name: "Widget", sku: "W-1", category: unknownId, unit: "EA" })
    .expect(400);
});

test("staff cannot mutate master data and managers are scoped to permitted warehouses", async () => {
  const manager = await createUser("MANAGER");
  const warehouseA = await Warehouse.create({
    ...warehouseBody("WH-A"),
    manager: manager._id,
  });
  const warehouseB = await Warehouse.create(warehouseBody("WH-B"));
  const staff = await createUser("STAFF", [warehouseA._id]);

  await withAuth(staff)
    .post("/api/v1/warehouses")
    .send(warehouseBody("WH-C"))
    .expect(403);
  await withAuth(staff)
    .post("/api/v1/locations")
    .send({
      name: "Bin",
      code: "BIN",
      warehouse: warehouseA._id,
      type: "STORAGE",
    })
    .expect(403);

  const visible = await withAuth(manager).get("/api/v1/warehouses").expect(200);
  assert.deepEqual(
    visible.body.data.map(({ _id }) => _id),
    [warehouseA._id.toString()],
  );
  const staffVisible = await withAuth(staff)
    .get("/api/v1/warehouses")
    .expect(200);
  assert.deepEqual(
    staffVisible.body.data.map(({ _id }) => _id),
    [warehouseA._id.toString()],
  );

  await withAuth(manager)
    .get(`/api/v1/warehouses/${warehouseB._id}`)
    .expect(403);
  await withAuth(manager)
    .post("/api/v1/locations")
    .send({
      name: "Bin",
      code: "BIN",
      warehouse: warehouseB._id,
      type: "STORAGE",
    })
    .expect(403);

  await withAuth(staff)
    .post("/api/v1/categories")
    .send({ name: "Restricted" })
    .expect(403);
  await withAuth(staff)
    .post("/api/v1/products")
    .send({
      name: "Restricted",
      sku: "R-1",
      category: new mongoose.Types.ObjectId(),
      unit: "EA",
    })
    .expect(403);
});

test("master-data search, filters, sorting, and pagination are applied", async () => {
  const admin = await createUser("ADMIN");
  const category = await Category.create({ name: "Fasteners" });
  const secondCategory = await Category.create({
    name: "Electrical",
    isActive: false,
  });
  const warehouse = await Warehouse.create(warehouseBody("WH-SEARCH"));
  await Warehouse.create({ ...warehouseBody("WH-OTHER"), isActive: false });
  await Location.create([
    {
      name: "North shelf",
      code: "N-1",
      warehouse: warehouse._id,
      type: "STORAGE",
    },
    {
      name: "Receiving dock",
      code: "R-1",
      warehouse: warehouse._id,
      type: "RECEIVING",
      isActive: false,
    },
  ]);
  await Product.create([
    { name: "Bolt", sku: "B-1", category: category._id, unit: "EA" },
    {
      name: "Nut",
      sku: "N-1",
      category: category._id,
      unit: "BOX",
      isActive: false,
    },
    { name: "Washer", sku: "W-1", category: secondCategory._id, unit: "EA" },
  ]);

  const warehouseResult = await withAuth(admin)
    .get("/api/v1/warehouses?search=search&status=active&page=1&limit=1")
    .expect(200);
  assert.equal(warehouseResult.body.pagination.totalItems, 1);
  assert.equal(warehouseResult.body.data[0].code, "WH-SEARCH");

  const locationResult = await withAuth(admin)
    .get(
      `/api/v1/locations?warehouseId=${warehouse._id}&type=STORAGE&status=active`,
    )
    .expect(200);
  assert.equal(locationResult.body.pagination.totalItems, 1);

  const categoryResult = await withAuth(admin)
    .get("/api/v1/categories?search=electrical&status=inactive")
    .expect(200);
  assert.equal(categoryResult.body.pagination.totalItems, 1);

  const result = await withAuth(admin)
    .get(
      `/api/v1/products?search=wa&category=${secondCategory._id}&unit=EA&status=active&page=1&limit=1&sortBy=name&sortOrder=asc`,
    )
    .expect(200);
  assert.equal(result.body.pagination.totalItems, 1);
  assert.equal(result.body.data[0].name, "Washer");
  assert.equal(result.body.pagination.page, 1);
  assert.equal(result.body.pagination.limit, 1);
});

test("PATCH endpoints update allowed fields and record updatedBy", async () => {
  const admin = await createUser("ADMIN");
  const warehouse = await Warehouse.create(warehouseBody("WH-EDIT"));
  const location = await Location.create({
    name: "Old shelf",
    code: "S-OLD",
    warehouse: warehouse._id,
  });
  const category = await Category.create({ name: "Old category" });
  const product = await Product.create({
    name: "Old item",
    sku: "OLD-1",
    category: category._id,
    unit: "EA",
  });

  const updatedWarehouse = await withAuth(admin)
    .patch(`/api/v1/warehouses/${warehouse._id}`)
    .send({ name: "Updated warehouse" })
    .expect(200);
  const updatedLocation = await withAuth(admin)
    .patch(`/api/v1/locations/${location._id}`)
    .send({ name: "Updated shelf" })
    .expect(200);
  const updatedCategory = await withAuth(admin)
    .patch(`/api/v1/categories/${category._id}`)
    .send({ description: "Updated description" })
    .expect(200);
  const updatedProduct = await withAuth(admin)
    .patch(`/api/v1/products/${product._id}`)
    .send({ minimumStockLevel: 3 })
    .expect(200);

  assert.equal(updatedWarehouse.body.data.updatedBy, admin._id.toString());
  assert.equal(updatedLocation.body.data.name, "Updated shelf");
  assert.equal(updatedCategory.body.data.description, "Updated description");
  assert.equal(updatedProduct.body.data.minimumStockLevel, 3);
});

test("deactivation preserves inventory history and blocks new inactive references", async () => {
  const admin = await createUser("ADMIN");
  const warehouse = await Warehouse.create(warehouseBody("WH-HISTORY"));
  const location = await Location.create({
    name: "Shelf",
    code: "S-1",
    warehouse: warehouse._id,
  });
  const category = await Category.create({ name: "History category" });
  const product = await Product.create({
    name: "Part",
    sku: "P-1",
    category: category._id,
    unit: "EA",
  });
  const historicalInventory = await Inventory.create({
    product: product._id,
    warehouse: warehouse._id,
    location: location._id,
    quantity: 9,
  });

  await withAuth(admin)
    .patch(`/api/v1/warehouses/${warehouse._id}/status`)
    .send({ isActive: false })
    .expect(200);
  assert.equal(
    await Inventory.countDocuments({ _id: historicalInventory._id }),
    1,
  );

  await assert.rejects(
    () =>
      Inventory.create({
        product: product._id,
        warehouse: warehouse._id,
        location: location._id,
        quantity: 10,
      }),
    /active warehouse|active location/i,
  );

  await withAuth(admin)
    .patch(`/api/v1/locations/${location._id}/status`)
    .send({ isActive: false })
    .expect(200);
  await withAuth(admin)
    .patch(`/api/v1/locations/${location._id}/status`)
    .send({ isActive: true })
    .expect(400);
  await assert.rejects(
    () =>
      Inventory.create({
        product: product._id,
        warehouse: warehouse._id,
        location: location._id,
        quantity: 10,
      }),
    /active warehouse|active location/i,
  );
});

test("inactive products cannot be used for new inventory", async () => {
  const admin = await createUser("ADMIN");
  const warehouse = await Warehouse.create(warehouseBody("WH-P"));
  const location = await Location.create({
    name: "Shelf",
    code: "S-1",
    warehouse: warehouse._id,
  });
  const category = await Category.create({ name: "Product status category" });
  const product = await Product.create({
    name: "Part",
    sku: "P-1",
    category: category._id,
    unit: "EA",
  });

  await withAuth(admin)
    .patch(`/api/v1/products/${product._id}/status`)
    .send({ isActive: false })
    .expect(200);
  await assert.rejects(
    () =>
      Inventory.create({
        product: product._id,
        warehouse: warehouse._id,
        location: location._id,
        quantity: 1,
      }),
    /active product/i,
  );
});

test("inactive locations cannot be used for new stock movements or transfers", async () => {
  const user = await createUser("ADMIN");
  const sourceWarehouse = await Warehouse.create(warehouseBody("WH-SOURCE"));
  const destinationWarehouse = await Warehouse.create(warehouseBody("WH-DEST"));
  const sourceLocation = await Location.create({
    name: "Source shelf",
    code: "SRC-1",
    warehouse: sourceWarehouse._id,
  });
  const destinationLocation = await Location.create({
    name: "Destination shelf",
    code: "DST-1",
    warehouse: destinationWarehouse._id,
  });
  const category = await Category.create({ name: "Movement category" });
  const product = await Product.create({
    name: "Movement item",
    sku: "M-1",
    category: category._id,
    unit: "EA",
  });
  await Location.updateOne({ _id: sourceLocation._id }, { isActive: false });

  await assert.rejects(
    () =>
      StockMovement.create({
        product: product._id,
        warehouse: sourceWarehouse._id,
        location: sourceLocation._id,
        movementType: "STOCK_IN",
        quantity: 1,
        previousQuantity: 0,
        newQuantity: 1,
        performedBy: user._id,
      }),
    /active location/i,
  );

  await assert.rejects(
    () =>
      Transfer.create({
        reference: "TR-INACTIVE-1",
        product: product._id,
        quantity: 1,
        sourceWarehouse: sourceWarehouse._id,
        sourceLocation: sourceLocation._id,
        destinationWarehouse: destinationWarehouse._id,
        destinationLocation: destinationLocation._id,
        initiatedBy: user._id,
      }),
    /active location/i,
  );
});

test("case-insensitive duplicate category names are rejected", async () => {
  const admin = await createUser("ADMIN");
  await Category.create({ name: "Electrical" });
  await withAuth(admin)
    .post("/api/v1/categories")
    .send({ name: "electrical" })
    .expect(409);
});
