require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const { User, Inventory, StockMovement, Transfer } = require("../src/models");

const { testDatabaseUri: DB_URI } = require("./helpers/database");
let supportsTransactions = false;

const recordId = (record) => String(record.id || record._id);
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const createAccount = async (authorization, role, email, warehouses = []) => {
  const response = await request(app)
    .post("/api/v1/users")
    .set(bearer(authorization))
    .send({
      firstName: role,
      lastName: "Acceptance",
      email,
      password: "StrongPassword123!",
      role,
      assignedWarehouses: warehouses,
    })
    .expect(201);
  return response.body.data;
};

const login = async (email) => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "StrongPassword123!" })
    .expect(200);
  return response.body.data.accessToken;
};

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

test("Phase 8 end-to-end warehouse operations acceptance flow", async (t) => {
  if (!supportsTransactions) {
    t.skip("Full acceptance requires MongoDB replica-set transactions; this deployment is standalone.");
    return;
  }

  await User.create({
    firstName: "Initial",
    lastName: "Administrator",
    email: "phase8-admin@example.test",
    password: "StrongPassword123!",
    role: "ADMIN",
  });
  const adminToken = await login("phase8-admin@example.test");

  const warehouseResponse = await request(app)
    .post("/api/v1/warehouses")
    .set(bearer(adminToken))
    .send({
      name: "Phase 8 Main Warehouse",
      code: "PH8-MAIN",
      address: { street: "1 Test Road", city: "Test", country: "Testland" },
    })
    .expect(201);
  const warehouseId = recordId(warehouseResponse.body.data);

  const sourceLocation = await request(app)
    .post("/api/v1/locations")
    .set(bearer(adminToken))
    .send({
      name: "Acceptance Source",
      code: "PH8-SRC",
      warehouse: warehouseId,
      type: "STORAGE",
    })
    .expect(201);
  const destinationLocation = await request(app)
    .post("/api/v1/locations")
    .set(bearer(adminToken))
    .send({
      name: "Acceptance Destination",
      code: "PH8-DST",
      warehouse: warehouseId,
      type: "PICKING",
    })
    .expect(201);

  const manager = await createAccount(
    adminToken,
    "MANAGER",
    "phase8-manager@example.test",
    [warehouseId],
  );
  const staff = await createAccount(
    adminToken,
    "STAFF",
    "phase8-staff@example.test",
    [warehouseId],
  );
  const managerToken = await login(manager.email);
  const staffToken = await login(staff.email);

  const categoryResponse = await request(app)
    .post("/api/v1/categories")
    .set(bearer(adminToken))
    .send({ name: "Phase 8 Category" })
    .expect(201);
  const productResponse = await request(app)
    .post("/api/v1/products")
    .set(bearer(adminToken))
    .send({
      name: "Acceptance Product",
      sku: "PH8-SKU",
      category: recordId(categoryResponse.body.data),
      unit: "EA",
      minimumStockLevel: 2,
    })
    .expect(201);
  const productId = recordId(productResponse.body.data);
  const sourceLocationId = recordId(sourceLocation.body.data);
  const destinationLocationId = recordId(destinationLocation.body.data);

  await request(app)
    .post("/api/v1/stock-movements/stock-in")
    .set(bearer(staffToken))
    .set("Idempotency-Key", "phase8-stock-in-001")
    .send({
      productId,
      warehouseId,
      locationId: sourceLocationId,
      quantity: 10,
      reason: "Initial receipt",
    })
    .expect(201);
  await request(app)
    .post("/api/v1/stock-movements/stock-out")
    .set(bearer(staffToken))
    .set("Idempotency-Key", "phase8-stock-out-001")
    .send({
      productId,
      warehouseId,
      locationId: sourceLocationId,
      quantity: 2,
      reason: "Acceptance issue",
    })
    .expect(201);
  await request(app)
    .post("/api/v1/stock-movements/stock-out")
    .set(bearer(staffToken))
    .set("Idempotency-Key", "phase8-stock-out-excess")
    .send({
      productId,
      warehouseId,
      locationId: sourceLocationId,
      quantity: 999,
      reason: "Excess issue must fail",
    })
    .expect(409);

  await request(app)
    .get("/api/v1/users")
    .set(bearer(staffToken))
    .expect(403);

  const transferResponse = await request(app)
    .post("/api/v1/transfers")
    .set(bearer(staffToken))
    .send({
      productId,
      quantity: 3,
      sourceWarehouseId: warehouseId,
      sourceLocationId,
      destinationWarehouseId: warehouseId,
      destinationLocationId,
      reference: "PH8-TRANSFER",
      notes: "Acceptance transfer",
    })
    .expect(201);
  const transferId = recordId(transferResponse.body.data);

  await request(app)
    .patch(`/api/v1/transfers/${transferId}/approve`)
    .set(bearer(managerToken))
    .expect(200);
  await request(app)
    .patch(`/api/v1/transfers/${transferId}/complete`)
    .set(bearer(managerToken))
    .expect(200);

  assert.equal(
    (await Inventory.findOne({ location: sourceLocationId })).quantity,
    5,
  );
  assert.equal(
    (await Inventory.findOne({ location: destinationLocationId })).quantity,
    3,
  );
  assert.equal(
    await StockMovement.countDocuments({
      relatedTransfer: transferId,
      movementType: "TRANSFER_OUT",
    }),
    1,
  );
  assert.equal(
    await StockMovement.countDocuments({
      relatedTransfer: transferId,
      movementType: "TRANSFER_IN",
    }),
    1,
  );
  assert.equal((await Transfer.findById(transferId)).status, "COMPLETED");

  const dashboard = await request(app)
    .get("/api/v1/dashboard/summary")
    .set(bearer(adminToken))
    .expect(200);
  assert.equal(dashboard.body.data.totals.inventoryUnits, 8);

  const movementReport = await request(app)
    .get("/api/v1/reports/stock-movements?warehouse=" + warehouseId)
    .set(bearer(adminToken))
    .expect(200);
  assert.ok(
    movementReport.body.data.some(
      (movement) => movement.movementType === "TRANSFER_OUT",
    ),
  );
  const transferReport = await request(app)
    .get("/api/v1/reports/transfers?warehouse=" + warehouseId)
    .set(bearer(adminToken))
    .expect(200);
  assert.ok(
    transferReport.body.data.some(
      (transfer) => transfer.id === transferId && transfer.status === "COMPLETED",
    ),
  );

  await request(app)
    .patch(`/api/v1/users/${recordId(staff)}/deactivate`)
    .set(bearer(adminToken))
    .expect(200);
  await request(app)
    .get("/api/v1/dashboard/summary")
    .set(bearer(staffToken))
    .expect(401);
});
