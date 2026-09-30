const mongoose = require("mongoose");
const { STOCK_MOVEMENT_TYPE_VALUES } = require("../constants");
const validateActiveReference = require("./activeReferenceValidation");

const stockMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required."],
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: [true, "Warehouse is required."],
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: [true, "Location is required."],
    },
    movementType: {
      type: String,
      enum: {
        values: STOCK_MOVEMENT_TYPE_VALUES,
        message: "movementType must be a valid stock movement type.",
      },
      required: [true, "Movement type is required."],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required."],
      min: [1, "Quantity must be greater than 0."],
    },
    previousQuantity: {
      type: Number,
      required: [true, "Previous quantity is required."],
      min: [0, "Previous quantity must be non-negative."],
    },
    newQuantity: {
      type: Number,
      required: [true, "New quantity is required."],
      min: [0, "New quantity must be non-negative."],
    },
    reason: {
      type: String,
      trim: true,
    },
    reference: String,
    notes: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Performed by is required."],
    },
    relatedTransfer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transfer",
    },
  },
  {
    timestamps: true,
  },
);

stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ warehouse: 1, location: 1, createdAt: -1 });

stockMovementSchema.pre("validate", async function (next) {
  try {
    await Promise.all([
      validateActiveReference(this, "product", "Product"),
      validateActiveReference(this, "warehouse", "Warehouse"),
      validateActiveReference(this, "location", "Location"),
    ]);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("StockMovement", stockMovementSchema);
