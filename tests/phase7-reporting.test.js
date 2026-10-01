const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const {
  Category,
  Inventory,
  Location,
  Product,
  StockMovement,
  Transfer,
  User,
  Warehouse,
} = require("../src/models");

const DB_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/warehouse_management_test";
const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me_1234567890";

const createUser = async (role, email = `${role.toLowerCase()}.${Date.now()}@example.com`) =>
  User.create({
    firstName: role,
    lastName: "Report",
    email,
    password: "StrongPassword123!",
    role,
  });

const tokenFor = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, ACCESS_SECRET, {
    expiresIn: "15m",
  });

const fixture = async () => {
  const admin = await createUser("ADMIN");
  const manager = await createUser("MANAGER");
  const staff = await createUser("STAFF");
  const warehouse = await Warehouse.create({
    name: "Report Warehouse",
    code: "RPT-01",
    address: { street: "1 Report Road", city: "Report", country: "Testland" },
    manager: manager._id,
  });
  const otherWarehouse = await Warehouse.create({
    name: "Other Report Warehouse",
    code: "RPT-02",
    address: { street: "2 Report Road", city: "Report", country: "Testland" },
  });
  manager.assignedWarehouses = [warehouse._id];
  staff.assignedWarehouses = [warehouse._id];
  await Promise.all([manager.save(), staff.save()]);
  const location = await Location.create({
    name: "Report Shelf",
    code: "R-01",
    warehouse: warehouse._id,
  });
  const otherLocation = await Location.create({
    name: "Other Shelf",
    code: "R-02",
    warehouse: warehouse._id,
  });
  const category = await Category.create({ name: "Report Category" });
  const lowProduct = await Product.create({
    name: "Low Report Product",
    sku: "REPORT-LOW",
    category: category._id,
    unit: "EA",
    minimumStockLevel: 5,
  });
  const emptyProduct = await Product.create({
    name: "Empty Report Product",
    sku: "REPORT-EMPTY",
    category: category._id,
    unit: "BOX",
    minimumStockLevel: 2,
  });
  await Inventory.create([
    {
      product: lowProduct._id,
      warehouse: warehouse._id,
      location: location._id,
      quantity: 4,
    },
    {
      product: emptyProduct._id,
      warehouse: warehouse._id,
      location: otherLocation._id,
      quantity: 0,
    },
  ]);
  await Inventory.create({
    product: lowProduct._id,
    warehouse: otherWarehouse._id,
    location: await Location.create({
      name: "External Shelf",
      code: "E-01",
      warehouse: otherWarehouse._id,
    }).then((record) => record._id),
    quantity: 100,
  });
  const movementAt = new Date("2026-10-01T10:30:00.000Z");
  await StockMovement.create({
    product: lowProduct._id,
    warehouse: warehouse._id,
    location,
    movementType: "STOCK_IN",
    quantity: 4,
    previousQuantity: 0,
    newQuantity: 4,
    reason: "Report fixture",
    reference: "RPT-MOVE-001",
    performedBy: staff._id,
    createdAt: movementAt,
    updatedAt: movementAt,
  });
  const transfer = await Transfer.create({
    reference: "RPT-TRANSFER-001",
    product: lowProduct._id,
    quantity: 2,
    sourceWarehouse: warehouse._id,
    sourceLocation: location._id,
    destinationWarehouse: otherWarehouse._id,
    destinationLocation: await Location.findOne({ warehouse: otherWarehouse._id }).then((record) => record._id),
    initiatedBy: staff._id,
  });
  return {
    admin,
    manager,
    staff,
    warehouse,
    otherWarehouse,
    location,
    category,
    lowProduct,
    emptyProduct,
    transfer,
    movementAt,
  };
};

const auth = (user) => `Bearer ${tokenFor(user)}`;

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

test("dashboard totals match database records and scope by role", async () => {
  const data = await fixture();
  const adminResponse = await request(app)
    .get("/api/v1/dashboard/summary")
    .set("Authorization", auth(data.admin))
    .expect(200);
  assert.equal(adminResponse.body.data.totals.warehouses, 2);
  assert.equal(adminResponse.body.data.totals.locations, 3);
  assert.equal(adminResponse.body.data.totals.activeProducts, 2);
  assert.equal(adminResponse.body.data.totals.inventoryUnits, 104);
  assert.equal(
    adminResponse.body.data.totals.lowStockProducts,
    1,
    JSON.stringify(adminResponse.body.data),
  );
  assert.equal(adminResponse.body.data.totals.outOfStockProducts, 1);
  assert.equal(adminResponse.body.data.totals.pendingTransfers, 1);
  assert.equal(adminResponse.body.data.recentStockMovements.length, 1);
  assert.equal(adminResponse.body.data.movementTotalsByType[0].count, 1);

  const managerResponse = await request(app)
    .get("/api/v1/dashboard/summary")
    .set("Authorization", auth(data.manager))
    .expect(200);
  assert.equal(managerResponse.body.data.totals.warehouses, 1);
  assert.equal(managerResponse.body.data.totals.inventoryUnits, 4);

  const staffResponse = await request(app)
    .get("/api/v1/dashboard/summary")
    .set("Authorization", auth(data.staff))
    .expect(200);
  assert.equal(staffResponse.body.data.totals.warehouses, 1);
  assert.equal(staffResponse.body.data.recentStockMovements.length, 1);
  assert.deepEqual(staffResponse.body.data.movementTotalsByType, []);
  assert.equal(staffResponse.body.data.recentTransfers.length, 1);
  assert.equal(
    JSON.stringify(staffResponse.body).includes(data.admin.email),
    false,
  );
});

test("inventory and low-stock reports filter and paginate with warehouse restrictions", async () => {
  const data = await fixture();
  const response = await request(app)
    .get(
      `/api/v1/reports/inventory?warehouse=${data.warehouse._id}&category=${data.category._id}&search=report&page=1&limit=999&sort=-quantity`,
    )
    .set("Authorization", auth(data.manager))
    .expect(200);
  assert.equal(response.body.pagination.totalItems, 2);
  assert.equal(response.body.pagination.limit, 50);
  assert.ok(response.body.data.every((item) => item.warehouse.id === String(data.warehouse._id)));

  const low = await request(app)
    .get(`/api/v1/reports/low-stock?product=${data.lowProduct._id}&warehouse=${data.warehouse._id}`)
    .set("Authorization", auth(data.staff))
    .expect(200);
  assert.equal(low.body.pagination.totalItems, 1);
  assert.equal(low.body.data[0].stockStatus, "LOW_STOCK");

  await request(app)
    .get(`/api/v1/reports/inventory?warehouse=${data.otherWarehouse._id}`)
    .set("Authorization", auth(data.manager))
    .expect(403);

  const empty = await request(app)
    .get("/api/v1/reports/inventory?search=does-not-exist")
    .set("Authorization", auth(data.admin))
    .expect(200);
  assert.deepEqual(empty.body.data, []);
  assert.equal(empty.body.pagination.totalPages, 0);

  await request(app)
    .get(
      `/api/v1/reports/warehouse-inventory?warehouse=${data.otherWarehouse._id}`,
    )
    .set("Authorization", auth(data.manager))
    .expect(403);
});

test("warehouse inventory report aggregates totals and applies date/category filters", async () => {
  const data = await fixture();
  const response = await request(app)
    .get(
      `/api/v1/reports/warehouse-inventory?warehouse=${data.warehouse._id}&category=${data.category._id}&startDate=2026-01-01&endDate=2026-12-31&sort=-totalInventoryUnits`,
    )
    .set("Authorization", auth(data.manager))
    .expect(200);
  assert.equal(response.body.pagination.totalItems, 1);
  assert.equal(response.body.data[0].totalInventoryUnits, 4);
  assert.equal(response.body.data[0].productCount, 2);

  await request(app)
    .get("/api/v1/reports/warehouse-inventory?startDate=2026-10-02&endDate=2026-10-01")
    .set("Authorization", auth(data.admin))
    .expect(400);
  await request(app)
    .get("/api/v1/reports/warehouse-inventory?startDate=2026-02-30")
    .set("Authorization", auth(data.admin))
    .expect(400);
  await request(app)
    .get(
      "/api/v1/reports/warehouse-inventory?startDate=2026-02-30T00:00:00Z",
    )
    .set("Authorization", auth(data.admin))
    .expect(400);
});

test("movement and transfer reports reuse scoped list services and include full date-only end days", async () => {
  const data = await fixture();
  const movement = await request(app)
    .get(
      `/api/v1/reports/stock-movements?warehouse=${data.warehouse._id}&movementType=STOCK_IN&performedBy=${data.staff._id}&search=RPT-MOVE&startDate=2026-10-01&endDate=2026-10-01`,
    )
    .set("Authorization", auth(data.manager))
    .expect(200);
  assert.equal(movement.body.pagination.totalItems, 1);

  const transfer = await request(app)
    .get(
      `/api/v1/reports/transfers?warehouse=${data.warehouse._id}&transferStatus=PENDING&search=RPT-TRANSFER&page=1&limit=5`,
    )
    .set("Authorization", auth(data.staff))
    .expect(200);
  assert.equal(transfer.body.pagination.totalItems, 1);
  await request(app)
    .get(`/api/v1/reports/transfers?warehouse=${data.otherWarehouse._id}`)
    .set("Authorization", auth(data.staff))
    .expect(403);

  await request(app)
    .get("/api/v1/reports/stock-movements?startDate=not-a-date")
    .set("Authorization", auth(data.admin))
    .expect(400);
});

test("OpenAPI document is served and describes Phase 7 routes", async () => {
  const response = await request(app).get("/api/v1/openapi.yaml").expect(200);
  assert.match(response.text, /openapi: 3\.0\.3/);
  assert.match(response.text, /\/dashboard\/summary:/);
  assert.match(response.text, /\/reports\/transfers:/);
  await request(app).get("/api/v1/dashboard/summary").expect(401);
});
