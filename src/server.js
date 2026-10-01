const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const app = require("./app");
const { connectDB } = require("./config/db");
const { validateAuthEnvironment } = require("./config/auth");
const { validateRuntimeEnvironment } = require("./config/runtime");

let server;
let shuttingDown = false;

const safeLogMessage = (value) => {
  let message = value instanceof Error ? value.message : String(value);
  for (const secret of [
    process.env.MONGODB_URI,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_REFRESH_SECRET,
    process.env.ADMIN_PASSWORD,
  ]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message.replace(
    /mongodb(?:\+srv)?:\/\/[^@\s]+@/gi,
    "mongodb://[redacted]@",
  );
};

const shutdown = async (signal, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}. Shutting down gracefully...`);

  const timeout = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10000);
  timeout.unref();

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await mongoose.connection.close(false).catch(() => {
    console.error("Database connection did not close cleanly.");
  });
  clearTimeout(timeout);
  process.exit(exitCode);
};

const startServer = async () => {
  const { port } = validateRuntimeEnvironment();
  validateAuthEnvironment();
  await connectDB();

  server = app.listen(port, () => {
    console.info(`Server is running on port ${port}`);
  });

  return server;
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", safeLogMessage(reason));
  void shutdown("unhandled promise rejection", 1);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", safeLogMessage(error));
  void shutdown("uncaught exception", 1);
});

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", safeLogMessage(error));
    process.exit(1);
  });
}

module.exports = { app, startServer, shutdown };
