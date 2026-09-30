const mongoose = require("mongoose");

const warehouseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Warehouse name is required."],
      trim: true,
      maxlength: [120, "Warehouse name cannot exceed 120 characters."],
    },
    code: {
      type: String,
      required: [true, "Warehouse code is required."],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [20, "Warehouse code cannot exceed 20 characters."],
    },
    address: {
      street: {
        type: String,
        required: [true, "Street is required."],
      },
      city: {
        type: String,
        required: [true, "City is required."],
      },
      state: String,
      postalCode: String,
      country: {
        type: String,
        required: [true, "Country is required."],
      },
    },
    description: {
      type: String,
      trim: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Warehouse", warehouseSchema);
