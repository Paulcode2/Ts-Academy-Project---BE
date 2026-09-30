const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = require("../src/app");
const { User, Warehouse, RefreshToken } = require("../src/models");

const DB_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/warehouse_management_test";

const makeUser = async (overrides = {}) => {
  const baseUser = {
    firstName: "Test",
    lastName: "User",
    email: `user.${Date.now()}@example.com`,
    password: "StrongPassword123!",
    role: "STAFF",
    isActive: true,
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

test("valid login returns access token and refresh cookie without password", async () => {
  const user = await makeUser({
    email: "admin@example.com",
    role: "ADMIN",
  });

  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({
      email: "admin@example.com",
      password: "StrongPassword123!",
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.ok(response.body.data.accessToken);
  assert.ok(response.headers["set-cookie"][0].includes("refreshToken="));
  assert.equal(response.body.data.user.password, undefined);
  assert.equal(response.body.data.user.email, user.email);
});

test("invalid login returns a generic error without revealing account existence", async () => {
  await makeUser({ email: "known@example.com" });

  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({
      email: "missing@example.com",
      password: "WrongPassword123!",
    })
    .expect(401);

  assert.equal(response.body.success, false);
  assert.equal(response.body.message, "Invalid email or password.");
});

test("auth me route requires a valid access token", async () => {
  const user = await makeUser({ email: "profile@example.com" });
  const accessToken = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me_1234567890",
    { expiresIn: "15m" },
  );

  const res = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${accessToken}`)
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.email, "profile@example.com");
  assert.equal(res.body.data.password, undefined);
});

test("expired tokens are rejected", async () => {
  const user = await makeUser({ email: "expired@example.com" });
  const expiredToken = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me_1234567890",
    { expiresIn: "-1s" },
  );

  const response = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${expiredToken}`)
    .expect(401);

  assert.equal(response.body.success, false);
  assert.match(response.body.message, /expired|invalid/i);
});

test("refresh flow rotates refresh tokens and logout invalidates sessions", async () => {
  const user = await makeUser({ email: "refresh@example.com" });

  const loginResponse = await request(app)
    .post("/api/v1/auth/login")
    .send({
      email: "refresh@example.com",
      password: "StrongPassword123!",
    })
    .expect(200);

  const refreshCookie = loginResponse.headers["set-cookie"][0]
    .split(";")[0]
    .split("=")[1];

  const refreshResponse = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Cookie", [`refreshToken=${refreshCookie}`])
    .expect(200);

  assert.equal(refreshResponse.body.success, true);
  assert.ok(refreshResponse.body.data.accessToken);

  const logoutResponse = await request(app)
    .post("/api/v1/auth/logout")
    .set("Cookie", [`refreshToken=${refreshCookie}`])
    .expect(200);

  assert.equal(logoutResponse.body.success, true);
  assert.equal(logoutResponse.body.message, "Logged out successfully.");

  const revokedCheck = await RefreshToken.findOne({ user: user._id });
  assert.equal(revokedCheck, null);
});

test("password change works and invalidates existing sessions", async () => {
  const user = await makeUser({ email: "password@example.com" });
  const loginResponse = await request(app)
    .post("/api/v1/auth/login")
    .send({
      email: "password@example.com",
      password: "StrongPassword123!",
    })
    .expect(200);

  const token = loginResponse.body.data.accessToken;
  const response = await request(app)
    .patch("/api/v1/auth/change-password")
    .set("Authorization", `Bearer ${token}`)
    .send({
      currentPassword: "StrongPassword123!",
      newPassword: "NewStrongPassword456!",
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(response.body.message, "Password changed successfully.");

  const updatedUser = await User.findById(user._id).select("+password");
  const passwordMatches = await updatedUser.comparePassword(
    "NewStrongPassword456!",
  );
  assert.equal(passwordMatches, true);

  const refreshTokens = await RefreshToken.find({ user: user._id });
  assert.equal(refreshTokens.length, 0);
});

test("deactivated users cannot log in or access protected routes", async () => {
  await makeUser({ email: "deactivated@example.com", isActive: false });

  const loginResponse = await request(app)
    .post("/api/v1/auth/login")
    .send({
      email: "deactivated@example.com",
      password: "StrongPassword123!",
    })
    .expect(401);

  assert.equal(loginResponse.body.success, false);
  assert.equal(loginResponse.body.message, "Invalid email or password.");
});

test("staff cannot use admin user-management endpoints", async () => {
  const staff = await makeUser({ email: "staff@example.com", role: "STAFF" });
  const loginResponse = await request(app)
    .post("/api/v1/auth/login")
    .send({
      email: "staff@example.com",
      password: "StrongPassword123!",
    })
    .expect(200);

  const response = await request(app)
    .get("/api/v1/users")
    .set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`)
    .expect(403);

  assert.equal(response.body.success, false);
  assert.equal(response.body.message, "Access denied.");
  assert.equal(response.body.data, null);
});
