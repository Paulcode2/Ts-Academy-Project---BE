const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = Number(process.env.PORT) || 5000;

let server;

const shutdown = async (signal) => {
  console.info(`Received ${signal}. Shutting down gracefully...`);

  if (server) {
    server.close(() => {
      mongoose.connection.close(false, () => {
        process.exit(0);
      });
    });
    return;
  }

  process.exit(0);
};

const startServer = async () => {
  await connectDB();

  server = app.listen(PORT, () => {
    console.info(`Server is running on port ${PORT}`);
  });

  return server;
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error("Unhandled promise rejection:", message);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error.message);
  process.exit(1);
});

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
}

module.exports = { app, startServer };
