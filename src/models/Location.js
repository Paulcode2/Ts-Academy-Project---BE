const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Location name is required."],
      trim: true,
      maxlength: [80, "Location name cannot exceed 80 characters."],
    },
    code: {
      type: String,
      required: [true, "Location code is required."],
      trim: true,
      uppercase: true,
      maxlength: [20, "Location code cannot exceed 20 characters."],
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: [true, "Warehouse is required for a location."],
    },
    type: {
      type: String,
      enum: {
        values: [
          "STORAGE",
          "PICKING",
          "RECEIVING",
          "QUARANTINE",
          "RETURN",
          "COLD_STORAGE",
        ],
        message: "Location type must be a valid warehouse location type.",
      },
      default: "STORAGE",
    },
    description: String,
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

locationSchema.index({ warehouse: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Location", locationSchema);
