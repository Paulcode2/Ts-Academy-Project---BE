const mongoose = require("mongoose");

const redactMongoUri = (mongoUri) => {
  if (!mongoUri) {
    return "not configured";
  }

  try {
    const parsedUri = new URL(mongoUri);

    if (parsedUri.username || parsedUri.password) {
      parsedUri.username = "***";
      parsedUri.password = "***";
    }

    return parsedUri.toString();
  } catch (error) {
    return mongoUri.replace(/\/\/([^@]+)@/, "//***@");
  }
};

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
    console.warn("MONGODB_URI is not defined. Database connection skipped.");
    return false;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.info("MongoDB connected successfully.");
    return true;
  } catch (error) {
    console.error(
      "MongoDB connection failed. Check MONGODB_URI and ensure the database is reachable.",
      {
        uri: redactMongoUri(mongoUri),
        error: error.message,
      },
    );
    return false;
  }
};

mongoose.connection.on("error", (error) => {
  console.error("MongoDB runtime error:", error.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected.");
});

module.exports = {
  connectDB,
  getDatabaseStatus,
};
