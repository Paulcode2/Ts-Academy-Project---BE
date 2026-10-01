require("dotenv").config();

const { User } = require("../src/models");
const { isStrongPassword } = require("../src/config/auth");
const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");

const requiredEnvKeys = [
  "ADMIN_FIRST_NAME",
  "ADMIN_LAST_NAME",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
];

const validateAdminConfig = () => {
  const missingKeys = requiredEnvKeys.filter((key) => !process.env[key]);

  if (missingKeys.length) {
    throw new Error(
      `Missing required admin env vars: ${missingKeys.join(", ")}`,
    );
  }

  if (!isStrongPassword(process.env.ADMIN_PASSWORD)) {
    throw new Error(
      "ADMIN_PASSWORD must contain at least 8 characters, including uppercase, lowercase, a number, and a special character.",
    );
  }
};

const createInitialAdmin = async () => {
  validateAdminConfig();

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      "MONGODB_URI is required to create the initial administrator.",
    );
  }

  await connectDB();

  try {
    const existingAdmin = await User.findOne({ role: "ADMIN" }).select("_id");
    if (existingAdmin) {
      throw new Error(
        "An administrator already exists. Use the authenticated user-management API to add another.",
      );
    }

    await User.create({
      firstName: process.env.ADMIN_FIRST_NAME,
      lastName: process.env.ADMIN_LAST_NAME,
      email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
      password: process.env.ADMIN_PASSWORD,
      role: "ADMIN",
      isActive: true,
    });

    console.info(
      `Initial admin created: ${process.env.ADMIN_EMAIL.trim().toLowerCase()}`,
    );
  } finally {
    await mongoose.disconnect();
  }
};

createInitialAdmin().catch((error) => {
  console.error("Failed to create initial admin:", error.message);
  process.exit(1);
});
