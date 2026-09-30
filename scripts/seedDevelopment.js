const mongoose = require("mongoose");
require("dotenv").config();

const {
  User,
  Warehouse,
  Location,
  Category,
  Product,
} = require("../src/models");

const seedDevelopmentData = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seeding is disabled in production.");
  }

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is required for seeding.");
  }

  await mongoose.connect(mongoUri);

  const adminUser = await User.findOneAndUpdate(
    { email: "admin@warehouse.local" },
    {
      firstName: "System",
      lastName: "Admin",
      email: "admin@warehouse.local",
      password: "ChangeMe123!",
      role: "ADMIN",
      isActive: true,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  const warehouse = await Warehouse.findOneAndUpdate(
    { code: "WH-001" },
    {
      name: "Central Warehouse",
      code: "WH-001",
      address: {
        street: "1 Main Avenue",
        city: "Nairobi",
        country: "Kenya",
      },
      description: "Primary warehouse for seed data.",
      manager: adminUser._id,
      createdBy: adminUser._id,
      isActive: true,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  const location = await Location.findOneAndUpdate(
    { warehouse: warehouse._id, code: "A-01" },
    {
      name: "Aisle A",
      code: "A-01",
      warehouse: warehouse._id,
      type: "STORAGE",
      description: "Primary storage aisle.",
      createdBy: adminUser._id,
      isActive: true,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  const category = await Category.findOneAndUpdate(
    { name: "Office Supplies" },
    {
      name: "Office Supplies",
      description: "Stationery and office items.",
      createdBy: adminUser._id,
      isActive: true,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  await Product.findOneAndUpdate(
    { sku: "SKU-001" },
    {
      name: "Notebook Pack",
      sku: "SKU-001",
      category: category._id,
      unit: "BOX",
      description: "Pack of notebooks.",
      minimumStockLevel: 10,
      createdBy: adminUser._id,
      isActive: true,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  console.info(
    `Seeded development data successfully. Warehouse: ${warehouse.code}, Location: ${location.code}`,
  );
  await mongoose.disconnect();
};

seedDevelopmentData().catch((error) => {
  console.error("Development seed failed:", error.message);
  process.exit(1);
});
