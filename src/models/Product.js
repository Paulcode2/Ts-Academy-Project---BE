const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required."],
      trim: true,
      maxlength: [120, "Product name cannot exceed 120 characters."],
    },
    sku: {
      type: String,
      required: [true, "SKU is required."],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [30, "SKU cannot exceed 30 characters."],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required."],
    },
    unit: {
      type: String,
      enum: {
        values: ["EA", "BOX", "CASE", "PALLET", "KG", "L", "SET", "BUNDLE"],
        message:
          "Unit must be one of EA, BOX, CASE, PALLET, KG, L, SET, BUNDLE.",
      },
      required: [true, "Unit is required."],
    },
    description: String,
    minimumStockLevel: {
      type: Number,
      default: 0,
      min: [0, "minimumStockLevel must be non-negative."],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Product", productSchema);
