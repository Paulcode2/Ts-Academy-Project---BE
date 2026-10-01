require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../src/app");
const errorHandler = require("../src/middleware/errorHandler");

test("GET /api/v1/health returns expected payload", async () => {
  const response = await request(app).get("/api/v1/health");

  const databaseReady = mongoose.connection.readyState === 1;
  assert.equal(response.status, databaseReady ? 200 : 503);
  assert.equal(response.body.success, databaseReady);
  assert.match(
    response.body.message,
    databaseReady ? /health check passed/i : /database unavailable/i,
  );
  assert.equal(
    response.body.environment,
    process.env.NODE_ENV || "development",
  );
  assert.equal(response.body.serverStatus, "running");
  assert.ok(response.body.timestamp);
  assert.ok(response.body.data);
  assert.equal(response.body.databaseStatus, databaseReady ? "connected" : "disconnected");
});

test("CORS allows configured origins and withholds access for unconfigured origins", async () => {
  const previous = process.env.FRONTEND_URL;
  try {
    process.env.FRONTEND_URL = "https://warehouse.example";
    const allowed = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://warehouse.example");
    assert.equal(allowed.headers["access-control-allow-origin"], "https://warehouse.example");

    const denied = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://attacker.example");
    assert.equal(denied.headers["access-control-allow-origin"], undefined);

    process.env.FRONTEND_URL = "";
    const noAllowList = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://attacker.example");
    assert.equal(noAllowList.headers["access-control-allow-origin"], undefined);
  } finally {
    if (previous === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previous;
  }
});

test("Unknown routes return a structured 404 response", async () => {
  const response = await request(app).get("/api/v1/unknown-route");

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.message, "Resource not found");
  assert.equal(response.body.data, null);
});

test("Unexpected errors reach the central error handler", async () => {
  const errorApp = express();

  errorApp.get("/test-error", (req, res, next) =>
    next(new Error("Test error")),
  );
  errorApp.use(errorHandler);

  const response = await request(errorApp).get("/test-error");

  assert.equal(response.status, 500);
  assert.equal(response.body.success, false);
  assert.equal(response.body.message, "Test error");
  assert.equal(response.body.data, null);
});

test("Production errors do not expose internal messages or stacks", async () => {
  const errorApp = express();
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    errorApp.get("/test-error", (req, res, next) =>
      next(new Error("sensitive implementation detail")),
    );
    errorApp.use(errorHandler);

    const response = await request(errorApp).get("/test-error").expect(500);
    assert.equal(response.body.message, "Something went wrong");
    assert.equal(response.body.stack, undefined);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("Production validation errors keep safe client guidance", async () => {
  const { AppError } = require("../src/utils");
  const errorApp = express();
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    errorApp.get("/test-validation", (req, res, next) =>
      next(new AppError("A valid productId is required.", 400, { field: "productId" })),
    );
    errorApp.use(errorHandler);

    const response = await request(errorApp).get("/test-validation").expect(400);
    assert.equal(response.body.message, "A valid productId is required.");
    assert.deepEqual(response.body.details, { field: "productId" });
    assert.equal(response.body.stack, undefined);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
