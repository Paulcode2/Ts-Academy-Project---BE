const defaultTestUri =
  "mongodb://127.0.0.1:27017/warehouse_management_test";
const testUri = process.env.MONGODB_TEST_URI || defaultTestUri;

const getTarget = (uri) => {
  const parsed = new URL(uri);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  return {
    databaseName,
    host: parsed.hostname.toLowerCase(),
    port: parsed.port || (parsed.protocol === "mongodb+srv:" ? "" : "27017"),
  };
};

let testTarget;
try {
  testTarget = getTarget(testUri);
} catch {
  throw new Error("MONGODB_TEST_URI must be a valid MongoDB connection URI.");
}

if (!/(?:^|[_-])test(?:$|[_-])/i.test(testTarget.databaseName)) {
  throw new Error(
    "MONGODB_TEST_URI must target a database with 'test' in its name.",
  );
}

if (process.env.MONGODB_URI) {
  let applicationTarget;
  try {
    applicationTarget = getTarget(process.env.MONGODB_URI);
  } catch {
    throw new Error(
      "The test suite cannot verify its database is separate from MONGODB_URI.",
    );
  }
  if (
    testTarget.host === applicationTarget.host &&
    testTarget.port === applicationTarget.port &&
    testTarget.databaseName === applicationTarget.databaseName
  ) {
    throw new Error(
      "The test suite refuses to use the application database; configure a separate MONGODB_TEST_URI.",
    );
  }
}

module.exports = { testDatabaseUri: testUri };
