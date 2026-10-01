require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const {
  Category,
  Inventory,
  InventoryOperation,
  Location,
  Product,
  StockMovement,
  User,
  Warehouse,
} = require("../src/models");

const { testDatabaseUri: DB_URI } = require("./helpers/database");
const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me_1234567890";
let supportsTransactions = false;

const createFixture = async (role = "STAFF") => {
  const user = await User.create({
    firstName: "Phase",
    lastName: "Five",
    email: `phase5.${role.toLowerCase()}.${Date.now()}@example.com`,
    password: "StrongPassword123!",
    role,
  });
  const warehouse = await Warehouse.create({
    name: "Phase Five Warehouse",
    code: `P5-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    address: { street: "1 Test Road", city: "Test City", country: "Testland" },
    createdBy: user._id,
  });
  user.assignedWarehouses = [warehouse._id];
  await user.save();
  const category = await Category.create({ name: `Category ${Date.now()}` });
  const product = await Product.create({
    name: "Sample Widget",
    sku: `P5-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    category: category._id,
    unit: "EA",
    minimumStockLevel: 5,
  });
  const location = await Location.create({
    name: "Main Shelf",
    code: "SHELF-01",
    warehouse: warehouse._id,
  });
  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    ACCESS_SECRET,
    { expiresIn: "15m" },
  );
  return { user, warehouse, category, product, location, token };
};

const stockPayload = (fixture, quantity = 4) => ({
  productId: String(fixture.product._id),
  warehouseId: String(fixture.warehouse._id),
  locationId: String(fixture.location._id),
  quantity,
  reason: "Phase 5 integration test",
  reference: "TEST-REF-01",
});

test.before(async () => {
  await mongoose.connect(DB_URI);
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  supportsTransactions = Boolean(hello.setName || hello.msg === "isdbgrid");
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

test("inventory queries populate display fields, filter stock status, and paginate", async () => {
  const fixture = await createFixture();
  const secondLocation = await Location.create({
    name: "Overflow Shelf",
    code: "SHELF-02",
    warehouse: fixture.warehouse._id,
  });
  await Inventory.create([
    {
      product: fixture.product._id,
      warehouse: fixture.warehouse._id,
      location: fixture.location._id,
      quantity: 3,
    },
    {
      product: fixture.product._id,
      warehouse: fixture.warehouse._id,
      location: secondLocation._id,
      quantity: 0,
    },
  ]);
  const restrictedWarehouse = await Warehouse.create({
    name: "Unassigned Warehouse",
    code: `P5-U-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    address: { street: "2 Test Road", city: "Test City", country: "Testland" },
  });
  const restrictedLocation = await Location.create({
    name: "Restricted Shelf",
    code: "RACK-01",
    warehouse: restrictedWarehouse._id,
  });
  await Inventory.create({
    product: fixture.product._id,
    warehouse: restrictedWarehouse._id,
    location: restrictedLocation._id,
    quantity: 2,
  });

  const low = await request(app)
    .get("/api/v1/inventory/low-stock?search=widget&page=1&limit=1")
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(200);
  assert.equal(low.body.pagination.totalItems, 1);
  assert.equal(low.body.data[0].product.sku, fixture.product.sku);
  assert.equal(low.body.data[0].category.name, fixture.category.name);
  assert.equal(low.body.data[0].stockStatus, "LOW_STOCK");
  assert.equal(low.body.data[0].warehouse.code, fixture.warehouse.code);
  assert.equal(low.body.data[0].location.code, fixture.location.code);
  const filtered = await request(app)
    .get(
      `/api/v1/inventory?product=${fixture.product._id}&warehouse=${fixture.warehouse._id}&location=${fixture.location._id}&category=${fixture.category._id}&stockStatus=LOW_STOCK&sort=quantity`,
    )
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(200);
  assert.equal(filtered.body.pagination.totalItems, 1);

  await request(app)
    .get(`/api/v1/inventory?warehouse=${restrictedWarehouse._id}`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(403);

  const out = await request(app)
    .get("/api/v1/inventory/out-of-stock")
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(200);
  assert.equal(out.body.pagination.totalItems, 1);
  assert.equal(out.body.data[0].stockStatus, "OUT_OF_STOCK");

  const all = await request(app)
    .get("/api/v1/inventory?category=invalid")
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(400);
  assert.equal(all.body.success, false);
});

test("movement history filters by product, type, reference, and date", async () => {
  const fixture = await createFixture();
  await StockMovement.create({
    product: fixture.product._id,
    warehouse: fixture.warehouse._id,
    location: fixture.location._id,
    movementType: "STOCK_IN",
    quantity: 8,
    previousQuantity: 0,
    newQuantity: 8,
    reason: "Initial receipt",
    reference: "PO-12345",
    performedBy: fixture.user._id,
  });
  const response = await request(app)
    .get(
      `/api/v1/stock-movements?product=${fixture.product._id}&type=STOCK_IN&reference=PO-123&startDate=2020-01-01`,
    )
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(200);
  assert.equal(response.body.pagination.totalItems, 1);
  assert.equal(response.body.data[0].reference, "PO-12345");
  assert.equal(response.body.data[0].performedBy.firstName, fixture.user.firstName);
});

test("staff cannot perform adjustments and zero stock-in is rejected", async () => {
  const fixture = await createFixture("STAFF");
  await request(app)
    .post("/api/v1/stock-movements/adjust")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-adjust-staff")
    .send({ ...stockPayload(fixture), newQuantity: 10 })
    .expect(403);

  const response = await request(app)
    .post("/api/v1/stock-movements/stock-in")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-stock-zero")
    .send(stockPayload(fixture, 0))
    .expect(400);
  assert.match(response.body.message, /positive/i);
  await request(app)
    .post("/api/v1/stock-movements/stock-out")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-stock-negative")
    .send(stockPayload(fixture, -1))
    .expect(400);
});

test("manager adjustment is authorized and idempotency header is CORS-enabled", async () => {
  const fixture = await createFixture("MANAGER");
  const response = await request(app)
    .post("/api/v1/stock-movements/adjust")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-manager-adj")
    .send({
      productId: String(fixture.product._id),
      warehouseId: String(fixture.warehouse._id),
      locationId: String(fixture.location._id),
      newQuantity: 4,
      reason: "Count correction",
    });
  if (supportsTransactions) {
    assert.equal(response.status, 201);
    assert.equal(response.body.data.movement.movementType, "ADJUSTMENT_IN");
  } else {
    assert.equal(response.status, 503);
    assert.match(response.body.message, /MongoDB transactions/i);
  }

  const previousFrontendUrl = process.env.FRONTEND_URL;
  let preflight;
  try {
    process.env.FRONTEND_URL = "http://localhost:3000";
    preflight = await request(app)
      .options("/api/v1/stock-movements/stock-in")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST")
      .set(
        "Access-Control-Request-Headers",
        "authorization,content-type,idempotency-key",
      )
      .expect(204);
  } finally {
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
  }
  assert.match(
    preflight.headers["access-control-allow-headers"],
    /Idempotency-Key/i,
  );
});

test("valid stock operations are atomic, auditable, and idempotent", async (t) => {
  if (!supportsTransactions) {
    t.skip("MongoDB deployment is standalone; transactions require a replica set.");
    return;
  }
  const fixture = await createFixture("ADMIN");
  const payload = stockPayload(fixture, 10);

  const concurrent = await Promise.all([
    request(app)
      .post("/api/v1/stock-movements/stock-in")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Idempotency-Key", "phase5-stockin-0001")
      .send(payload),
    request(app)
      .post("/api/v1/stock-movements/stock-in")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Idempotency-Key", "phase5-stockin-0001")
      .send(payload),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status), [201, 201]);
  const first = concurrent[0];
  const replay = await request(app)
    .post("/api/v1/stock-movements/stock-in")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-stockin-0001")
    .send(payload)
    .expect(201);
  assert.equal(replay.body.data.replayed, true);
  assert.equal(
    replay.body.data.movement.id,
    first.body.data.movement.id,
  );
  assert.equal(await Inventory.countDocuments(), 1);
  assert.equal(await StockMovement.countDocuments(), 1);
  const conflict = await request(app)
    .post("/api/v1/stock-movements/stock-in")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-stockin-0001")
    .send(stockPayload(fixture, 99))
    .expect(409);
  assert.match(conflict.body.message, /different request/i);

  await request(app)
    .post("/api/v1/stock-movements/stock-in")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-missing-product")
    .send({
      ...payload,
      productId: new mongoose.Types.ObjectId().toString(),
    })
    .expect(404);

  const otherWarehouse = await Warehouse.create({
    name: "Other Warehouse",
    code: `P5-O-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    address: { street: "3 Test Road", city: "Test City", country: "Testland" },
  });
  const otherLocation = await Location.create({
    name: "Other Shelf",
    code: "OTHER-01",
    warehouse: otherWarehouse._id,
  });
  await request(app)
    .post("/api/v1/stock-movements/stock-in")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-location-mismatch")
    .send({ ...payload, locationId: String(otherLocation._id) })
    .expect(400);
  await Location.updateOne({ _id: fixture.location._id }, { isActive: false });
  await request(app)
    .post("/api/v1/stock-movements/stock-in")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-inactive-location")
    .send({ ...payload, locationId: String(fixture.location._id) })
    .expect(404);
  await Location.updateOne({ _id: fixture.location._id }, { isActive: true });

  const originalMovementCreate = StockMovement.create;
  try {
    StockMovement.create = async () => {
      throw new Error("Simulated movement insertion failure.");
    };
    await request(app)
      .post("/api/v1/stock-movements/stock-in")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Idempotency-Key", "phase5-rollback-001")
      .send(stockPayload(fixture, 2))
      .expect(500);
  } finally {
    StockMovement.create = originalMovementCreate;
  }
  assert.equal((await Inventory.findOne()).quantity, 10);
  assert.equal(await StockMovement.countDocuments(), 1);
  assert.equal(await InventoryOperation.countDocuments(), 1);

  await request(app)
    .post("/api/v1/stock-movements/stock-in")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-stockin-0002")
    .send(stockPayload(fixture, 5))
    .expect(201);
  await request(app)
    .post("/api/v1/stock-movements/stock-out")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-stockout-0001")
    .send(stockPayload(fixture, 4))
    .expect(201);
  const inventory = await Inventory.findOne();
  assert.equal(inventory.quantity, 11);
  assert.equal(await StockMovement.countDocuments(), 3);

  const beforeFailedMovement = inventory.quantity;
  await request(app)
    .post("/api/v1/stock-movements/stock-out")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-stockout-excess")
    .send(stockPayload(fixture, 100))
    .expect(409);
  assert.equal((await Inventory.findOne()).quantity, beforeFailedMovement);
  assert.equal(await StockMovement.countDocuments(), 3);
  assert.equal(await InventoryOperation.countDocuments(), 3);
});

test("valid stock operation requires transaction-capable MongoDB", async (t) => {
  if (supportsTransactions) {
    t.skip("This deployment supports transactions; covered by transaction integration test.");
    return;
  }
  const fixture = await createFixture("ADMIN");
  const response = await request(app)
    .post("/api/v1/stock-movements/stock-in")
    .set("Authorization", `Bearer ${fixture.token}`)
    .set("Idempotency-Key", "phase5-standalone")
    .send(stockPayload(fixture))
    .expect(503);
  assert.match(response.body.message, /replica set|sharded cluster/i);
  assert.equal(await Inventory.countDocuments(), 0);
  assert.equal(await StockMovement.countDocuments(), 0);
});
