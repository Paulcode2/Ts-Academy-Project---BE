require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { validateRuntimeEnvironment } = require("../src/config/runtime");

const runAuthConfig = ({ access, refresh }) => {
  const env = {
    ...process.env,
    NODE_ENV: "production",
  };
  if (access === undefined) delete env.JWT_ACCESS_SECRET;
  else env.JWT_ACCESS_SECRET = access;
  if (refresh === undefined) delete env.JWT_REFRESH_SECRET;
  else env.JWT_REFRESH_SECRET = refresh;

  return spawnSync(
    process.execPath,
    ["-e", 'require("./src/config/auth").validateAuthEnvironment()'],
    {
      cwd: path.resolve(__dirname, ".."),
      env,
      encoding: "utf8",
    },
  );
};

test("production refuses missing, weak, repeated, and shared JWT secrets", () => {
  const missing = runAuthConfig({});
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /are required/i);

  const weak = runAuthConfig({
    access: "A".repeat(48),
    refresh: crypto.randomBytes(48).toString("base64url"),
  });
  assert.notEqual(weak.status, 0);
  assert.match(weak.stderr, /random values/i);

  const shared = crypto.randomBytes(48).toString("base64url");
  const repeated = runAuthConfig({ access: shared, refresh: shared });
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /must be different/i);
});

test("production accepts distinct, high-entropy JWT secrets", () => {
  const result = runAuthConfig({
    access: crypto.randomBytes(48).toString("base64url"),
    refresh: crypto.randomBytes(48).toString("base64url"),
  });
  assert.equal(result.status, 0, result.stderr);
});

test("production runtime requires an exact HTTPS origin and a valid port", () => {
  assert.throws(
    () => validateRuntimeEnvironment({ NODE_ENV: "production", PORT: "3000" }),
    /FRONTEND_URL/,
  );
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        NODE_ENV: "production",
        PORT: "not-a-port",
        FRONTEND_URL: "https://warehouse.example",
      }),
    /PORT/,
  );
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        NODE_ENV: "production",
        FRONTEND_URL: "https://warehouse.example/path",
      }),
    /HTTPS origin without a path/,
  );
  assert.deepEqual(
    validateRuntimeEnvironment({
      NODE_ENV: "production",
      PORT: "3000",
      FRONTEND_URL: "https://warehouse.example,https://admin.example",
    }),
    {
      port: 3000,
      frontendOrigins: ["https://warehouse.example", "https://admin.example"],
    },
  );
  assert.deepEqual(
    validateRuntimeEnvironment({
      NODE_ENV: "production",
      PORT: "3000",
      FRONTEND_URL: "http://localhost:5173",
    }),
    {
      port: 3000,
      frontendOrigins: ["http://localhost:5173"],
    },
  );
});

test("test database configuration refuses a production URI", () => {
  const defaultTestUri = "mongodb://127.0.0.1:27017/warehouse_management_test";
  const sameUri = spawnSync(
    process.execPath,
    ["-e", 'require("./tests/helpers/database")'],
    {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        MONGODB_URI: defaultTestUri,
        MONGODB_TEST_URI: defaultTestUri,
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(sameUri.status, 0);
  assert.match(sameUri.stderr, /refuses to use the application database/i);

  const sameTargetWithDifferentOptions = spawnSync(
    process.execPath,
    ["-e", 'require("./tests/helpers/database")'],
    {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        MONGODB_URI: `${defaultTestUri}?directConnection=true`,
        MONGODB_TEST_URI: defaultTestUri,
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(sameTargetWithDifferentOptions.status, 0);
  assert.match(
    sameTargetWithDifferentOptions.stderr,
    /refuses to use the application database/i,
  );

  const wrongDatabase = spawnSync(
    process.execPath,
    ["-e", 'require("./tests/helpers/database")'],
    {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        MONGODB_URI: "",
        MONGODB_TEST_URI: "mongodb://127.0.0.1:27017/warehouse_management",
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(wrongDatabase.status, 0);
  assert.match(wrongDatabase.stderr, /database with 'test' in its name/i);
});
