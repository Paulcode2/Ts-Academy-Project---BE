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
  Location,
  Product,
  StockMovement,
  Transfer,
  User,
  Warehouse,
} = require("../src/models");

const { testDatabaseUri: DB_URI } = require("./helpers/database");
const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me_1234567890";
let supportsTransactions = false;

const tokenFor = (user) =>
  jwt.sign(
    { sub: user._id.toString(), role: user.role },
    ACCESS_SECRET,
    { expiresIn: "15m" },
  );

const createUser = async (role, email) =>
  User.create({
    firstName: role,
    lastName: "Transfer",
    email: email || `${role.toLowerCase()}.${Date.now()}@example.com`,
    password: "StrongPassword123!",
    role,
  });

const createFixture = async ({ role = "STAFF", assignSource = true } = {}) => {
  const user = await createUser(role);
  const sourceWarehouse = await Warehouse.create({
    name: "Transfer Source",
    code: `TS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    address: { street: "1 Source Road", city: "Test", country: "Testland" },
    ...(role === "MANAGER" ? { manager: user._id } : {}),
  });
  const destinationWarehouse = await Warehouse.create({
    name: "Transfer Destination",
    code: `TD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    address: { street: "2 Destination Road", city: "Test", country: "Testland" },
  });
  if (assignSource) {
    user.assignedWarehouses = [sourceWarehouse._id];
    await user.save();
  }
  const sourceLocation = await Location.create({
    name: "Source Shelf",
    code: "SRC-01",
    warehouse: sourceWarehouse._id,
  });
  const destinationLocation = await Location.create({
    name: "Destination Shelf",
    code: "DST-01",
    warehouse: destinationWarehouse._id,
  });
  const category = await Category.create({ name: `Transfer ${Date.now()}` });
  const product = await Product.create({
    name: "Transfer Product",
    sku: `TR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    category: category._id,
    unit: "EA",
  });
  const inventory = await Inventory.create({
    product: product._id,
    warehouse: sourceWarehouse._id,
    location: sourceLocation._id,
    quantity: 20,
  });
  return {
    user,
    token: tokenFor(user),
    sourceWarehouse,
    destinationWarehouse,
    sourceLocation,
    destinationLocation,
    product,
    inventory,
  };
};

const bodyFor = (fixture, overrides = {}) => ({
  productId: String(fixture.product._id),
  quantity: 6,
  sourceWarehouseId: String(fixture.sourceWarehouse._id),
  sourceLocationId: String(fixture.sourceLocation._id),
  destinationWarehouseId: String(fixture.destinationWarehouse._id),
  destinationLocationId: String(fixture.destinationLocation._id),
  reference: `REQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  notes: "Phase 6 integration test",
  ...overrides,
});

const createTransferRequest = (fixture, overrides = {}) =>
  request(app)
    .post("/api/v1/transfers")
    .set("Authorization", `Bearer ${fixture.token}`)
    .send(bodyFor(fixture, overrides));

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

test("transfer request validates inputs, scopes source access, and leaves inventory unchanged", async () => {
  const fixture = await createFixture();
  const response = await createTransferRequest(fixture).expect(201);
  assert.equal(response.body.data.status, "PENDING");
  assert.ok(response.body.data.reference);
  assert.equal(response.body.data.product.name, "Transfer Product");
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 20);

  await createTransferRequest(fixture, {
    quantity: 0,
  }).expect(400);
  await createTransferRequest(fixture, {
    quantity: -1,
  }).expect(400);
  await createTransferRequest(fixture, {
    quantity: 99,
  }).expect(409);
  await createTransferRequest(fixture, {
    destinationWarehouseId: String(fixture.sourceWarehouse._id),
    destinationLocationId: String(fixture.sourceLocation._id),
  }).expect(400);
  await createTransferRequest(fixture, {
    destinationWarehouseId: String(fixture.sourceWarehouse._id),
  }).expect(400);
  await createTransferRequest(fixture, {
    productId: new mongoose.Types.ObjectId().toString(),
  }).expect(404);

  await Location.updateOne(
    { _id: fixture.destinationLocation._id },
    { isActive: false },
  );
  await createTransferRequest(fixture).expect(404);
  await Location.updateOne(
    { _id: fixture.destinationLocation._id },
    { isActive: true },
  );
  await Product.updateOne({ _id: fixture.product._id }, { isActive: false });
  await createTransferRequest(fixture).expect(404);
  await Product.updateOne({ _id: fixture.product._id }, { isActive: true });

  const otherSourceLocation = await Location.create({
    name: "Second Source Shelf",
    code: "SRC-02",
    warehouse: fixture.sourceWarehouse._id,
  });
  const sameWarehouseTransfer = await createTransferRequest(fixture, {
    destinationWarehouseId: String(fixture.sourceWarehouse._id),
    destinationLocationId: String(otherSourceLocation._id),
  }).expect(201);
  assert.equal(sameWarehouseTransfer.body.data.status, "PENDING");
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 20);

  const unassigned = await createFixture({ role: "STAFF", assignSource: false });
  await createTransferRequest(unassigned).expect(403);
});

test("transfer list and detail enforce warehouse visibility and support filters", async () => {
  const fixture = await createFixture();
  const created = await createTransferRequest(fixture).expect(201);
  const list = await request(app)
    .get(
      `/api/v1/transfers?status=PENDING&product=${fixture.product._id}&sourceWarehouse=${fixture.sourceWarehouse._id}&initiatedBy=${fixture.user._id}&reference=${encodeURIComponent(created.body.data.reference)}&startDate=2020-01-01&page=1&limit=5&sort=-createdAt`,
    )
    .set("Authorization", `Bearer ${fixture.token}`);
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.pagination.totalItems, 1);
  assert.equal(list.body.data[0].status, "PENDING");
  await request(app)
    .get(`/api/v1/transfers/${created.body.data.id}`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(200);
  fixture.user.assignedWarehouses = [];
  await fixture.user.save();
  await request(app)
    .get(`/api/v1/transfers/${created.body.data.id}`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(200);

  const otherUser = await createUser("STAFF");
  await request(app)
    .get(`/api/v1/transfers/${created.body.data.id}`)
    .set("Authorization", `Bearer ${tokenFor(otherUser)}`)
    .expect(403);
  await request(app)
    .get("/api/v1/transfers?status=NOT_A_STATUS")
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(400);
});

test("ADMIN and authorized MANAGER approve; invalid transitions and STAFF approval are forbidden", async () => {
  const fixture = await createFixture({ role: "STAFF" });
  const created = await createTransferRequest(fixture).expect(201);
  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/approve`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(403);

  const unassignedManager = await createUser("MANAGER");
  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/approve`)
    .set("Authorization", `Bearer ${tokenFor(unassignedManager)}`)
    .expect(403);

  const manager = await createUser("MANAGER");
  manager.assignedWarehouses = [fixture.sourceWarehouse._id];
  await manager.save();
  const managerToken = tokenFor(manager);
  const approved = await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/approve`)
    .set("Authorization", `Bearer ${managerToken}`)
    .expect(200);
  assert.equal(approved.body.data.status, "APPROVED");
  assert.equal(String(approved.body.data.approvedBy), String(manager._id));
  assert.ok(approved.body.data.approvedAt);
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 20);

  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/approve`)
    .set("Authorization", `Bearer ${managerToken}`)
    .expect(409);
  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/reject`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ rejectionReason: "Too late" })
    .expect(409);

  const admin = await createUser("ADMIN");
  const adminTransfer = await createTransferRequest(fixture).expect(201);
  const adminApproved = await request(app)
    .patch(`/api/v1/transfers/${adminTransfer.body.data.id}/approve`)
    .set("Authorization", `Bearer ${tokenFor(admin)}`)
    .expect(200);
  assert.equal(adminApproved.body.data.status, "APPROVED");
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 20);
});

test("pending transfer can be rejected with a reason and does not change inventory", async () => {
  const fixture = await createFixture({ role: "MANAGER" });
  const created = await createTransferRequest(fixture).expect(201);
  const missingReason = await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/reject`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .send({})
    .expect(400);
  assert.match(missingReason.body.message, /rejectionReason/i);
  const rejected = await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/reject`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .send({ rejectionReason: "Source count discrepancy" })
    .expect(200);
  assert.equal(rejected.body.data.status, "REJECTED");
  assert.equal(rejected.body.data.rejectionReason, "Source count discrepancy");
  assert.ok(rejected.body.data.rejectedAt);
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 20);
  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/cancel`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(409);
});

test("initiator may cancel pending or approved transfers; other STAFF may not", async () => {
  const fixture = await createFixture();
  const pending = await createTransferRequest(fixture).expect(201);
  const cancelled = await request(app)
    .patch(`/api/v1/transfers/${pending.body.data.id}/cancel`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(200);
  assert.equal(cancelled.body.data.status, "CANCELLED");
  assert.ok(cancelled.body.data.cancelledAt);
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 20);

  const otherUser = await createUser("STAFF");
  const pendingAgain = await createTransferRequest(fixture).expect(201);
  await request(app)
    .patch(`/api/v1/transfers/${pendingAgain.body.data.id}/cancel`)
    .set("Authorization", `Bearer ${tokenFor(otherUser)}`)
    .expect(403);

  const manager = await createUser("MANAGER");
  manager.assignedWarehouses = [fixture.sourceWarehouse._id];
  await manager.save();
  await request(app)
    .patch(`/api/v1/transfers/${pendingAgain.body.data.id}/approve`)
    .set("Authorization", `Bearer ${tokenFor(manager)}`)
    .expect(200);
  const cancelledApproved = await request(app)
    .patch(`/api/v1/transfers/${pendingAgain.body.data.id}/cancel`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(200);
  assert.equal(cancelledApproved.body.data.status, "CANCELLED");
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 20);
});

test("completion requires approval and a transaction-capable MongoDB deployment", async () => {
  const fixture = await createFixture({ role: "MANAGER" });
  const created = await createTransferRequest(fixture).expect(201);
  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/complete`)
    .set("Authorization", `Bearer ${fixture.token}`)
    .expect(409);

  const manager = await createUser("MANAGER");
  manager.assignedWarehouses = [fixture.sourceWarehouse._id];
  await manager.save();
  const managerToken = tokenFor(manager);
  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/approve`)
    .set("Authorization", `Bearer ${managerToken}`)
    .expect(200);

  if (!supportsTransactions) {
    const response = await request(app)
      .patch(`/api/v1/transfers/${created.body.data.id}/complete`)
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(503);
    assert.match(response.body.message, /replica set|sharded cluster/i);
    assert.equal((await Transfer.findById(created.body.data.id)).status, "APPROVED");
    assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 20);
    assert.equal(await StockMovement.countDocuments(), 0);
  }
});

test("approved transfer completion atomically moves stock, records both movements, and cannot repeat", async (t) => {
  if (!supportsTransactions) {
    t.skip("MongoDB deployment is standalone; completion needs replica-set transactions.");
    return;
  }
  const fixture = await createFixture({ role: "MANAGER" });
  const created = await createTransferRequest(fixture).expect(201);
  const manager = await createUser("MANAGER");
  manager.assignedWarehouses = [fixture.sourceWarehouse._id];
  await manager.save();
  const authorization = `Bearer ${tokenFor(manager)}`;
  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/approve`)
    .set("Authorization", authorization)
    .expect(200);

  const complete = await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/complete`)
    .set("Authorization", authorization)
    .expect(200);
  assert.equal(complete.body.data.transfer.status, "COMPLETED");
  assert.equal(complete.body.data.stock.source.quantity, 14);
  assert.equal(complete.body.data.stock.destination.quantity, 6);
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 14);
  const destination = await Inventory.findOne({
    product: fixture.product._id,
    location: fixture.destinationLocation._id,
  });
  assert.equal(destination.quantity, 6);
  assert.equal(await StockMovement.countDocuments({ relatedTransfer: created.body.data.id }), 2);

  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/complete`)
    .set("Authorization", authorization)
    .expect(409);
  assert.equal(await StockMovement.countDocuments({ relatedTransfer: created.body.data.id }), 2);
});

test("completion rolls back inventory, movements, and status when movement persistence fails", async (t) => {
  if (!supportsTransactions) {
    t.skip("MongoDB deployment is standalone; rollback verification requires transactions.");
    return;
  }
  const fixture = await createFixture({ role: "MANAGER" });
  const created = await createTransferRequest(fixture).expect(201);
  const manager = await createUser("MANAGER");
  manager.assignedWarehouses = [fixture.sourceWarehouse._id];
  await manager.save();
  const authorization = `Bearer ${tokenFor(manager)}`;
  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/approve`)
    .set("Authorization", authorization)
    .expect(200);
  const originalCreate = StockMovement.create;
  try {
    StockMovement.create = async () => {
      throw new Error("Simulated movement persistence failure.");
    };
    await request(app)
      .patch(`/api/v1/transfers/${created.body.data.id}/complete`)
      .set("Authorization", authorization)
      .expect(500);
  } finally {
    StockMovement.create = originalCreate;
  }
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 20);
  assert.equal(
    await Inventory.countDocuments({ location: fixture.destinationLocation._id }),
    0,
  );
  assert.equal(await StockMovement.countDocuments(), 0);
  assert.equal((await Transfer.findById(created.body.data.id)).status, "APPROVED");

  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/complete`)
    .set("Authorization", authorization)
    .expect(200);
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 14);
});

test("concurrent transfer completions cannot process the same transfer twice", async (t) => {
  if (!supportsTransactions) {
    t.skip("MongoDB deployment is standalone; concurrency completion test requires transactions.");
    return;
  }
  const fixture = await createFixture({ role: "MANAGER" });
  const created = await createTransferRequest(fixture).expect(201);
  const manager = await createUser("MANAGER");
  manager.assignedWarehouses = [fixture.sourceWarehouse._id];
  await manager.save();
  const authorization = `Bearer ${tokenFor(manager)}`;
  await request(app)
    .patch(`/api/v1/transfers/${created.body.data.id}/approve`)
    .set("Authorization", authorization)
    .expect(200);
  const responses = await Promise.all([
    request(app)
      .patch(`/api/v1/transfers/${created.body.data.id}/complete`)
      .set("Authorization", authorization),
    request(app)
      .patch(`/api/v1/transfers/${created.body.data.id}/complete`)
      .set("Authorization", authorization),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal(await StockMovement.countDocuments({ relatedTransfer: created.body.data.id }), 2);
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 14);
});

test("concurrent transfers cannot consume more source stock than available", async (t) => {
  if (!supportsTransactions) {
    t.skip("MongoDB deployment is standalone; competing transfer test requires transactions.");
    return;
  }
  const fixture = await createFixture({ role: "MANAGER" });
  const first = await createTransferRequest(fixture, { quantity: 13 }).expect(201);
  const second = await createTransferRequest(fixture, { quantity: 13 }).expect(201);
  const managerToken = `Bearer ${tokenFor(fixture.user)}`;
  await request(app)
    .patch(`/api/v1/transfers/${first.body.data.id}/approve`)
    .set("Authorization", managerToken)
    .expect(200);
  await request(app)
    .patch(`/api/v1/transfers/${second.body.data.id}/approve`)
    .set("Authorization", managerToken)
    .expect(200);

  const responses = await Promise.all([
    request(app)
      .patch(`/api/v1/transfers/${first.body.data.id}/complete`)
      .set("Authorization", managerToken),
    request(app)
      .patch(`/api/v1/transfers/${second.body.data.id}/complete`)
      .set("Authorization", managerToken),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal((await Inventory.findById(fixture.inventory._id)).quantity, 7);
  assert.equal(await StockMovement.countDocuments(), 2);
  assert.equal(
    await Transfer.countDocuments({ status: "COMPLETED" }),
    1,
  );
});
