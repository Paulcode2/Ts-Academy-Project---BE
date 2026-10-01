const mongoose = require("mongoose");

const getDatabaseStatus = () => {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  return states[mongoose.connection.readyState] || "unknown";
};

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is required before starting the server.");
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.info("MongoDB connected successfully.");
    return true;
  } catch (error) {
    const safeMessage = String(error.message || "Unknown database error")
      .replace(mongoUri, "[redacted MongoDB URI]")
      .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, "mongodb://[redacted]@");
    console.error(
      "MongoDB connection failed. Check MONGODB_URI and ensure the database is reachable.",
      process.env.NODE_ENV === "production" ? "" : safeMessage,
    );
    throw new Error("MongoDB connection failed; verify the database configuration and availability.");
  }
};

mongoose.connection.on("error", (error) => {
  let safeMessage = String(error.message || "Unknown database error");
  if (process.env.MONGODB_URI) {
    safeMessage = safeMessage.replace(
      process.env.MONGODB_URI,
      "[redacted MongoDB URI]",
    );
  }
  safeMessage = safeMessage.replace(
    /mongodb(?:\+srv)?:\/\/[^@\s]+@/gi,
    "mongodb://[redacted]@",
  );
  console.error(
    "MongoDB runtime error:",
    process.env.NODE_ENV === "production" ? "Database connection error." : safeMessage,
  );
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected.");
});

module.exports = {
  connectDB,
  getDatabaseStatus,
};
