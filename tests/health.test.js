const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const app = require("../src/app");
const errorHandler = require("../src/middleware/errorHandler");

test("GET /api/v1/health returns expected payload", async () => {
  const response = await request(app).get("/api/v1/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.match(response.body.message, /health check passed/i);
  assert.equal(
    response.body.environment,
    process.env.NODE_ENV || "development",
  );
  assert.equal(response.body.serverStatus, "running");
  assert.ok(response.body.timestamp);
  assert.ok(response.body.data);
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
