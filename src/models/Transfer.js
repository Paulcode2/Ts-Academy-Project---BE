const mongoose = require("mongoose");
const { TRANSFER_STATUS_VALUES } = require("../constants");

const transferSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: [true, "Transfer reference is required."],
      unique: true,
      trim: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required."],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required."],
      min: [1, "Quantity must be greater than 0."],
    },
    sourceWarehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: [true, "Source warehouse is required."],
    },
    sourceLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: [true, "Source location is required."],
    },
    destinationWarehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: [true, "Destination warehouse is required."],
    },
    destinationLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: [true, "Destination location is required."],
    },
    status: {
      type: String,
      enum: {
        values: TRANSFER_STATUS_VALUES,
        message: "status must be a valid transfer status.",
      },
      default: "PENDING",
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Initiated by is required."],
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    notes: String,
    rejectionReason: String,
    approvedAt: Date,
    completedAt: Date,
    rejectedAt: Date,
    cancelledAt: Date,
  },
  {
    timestamps: true,
  },
);

transferSchema.pre("validate", function (next) {
  if (
    this.sourceWarehouse &&
    this.destinationWarehouse &&
    String(this.sourceWarehouse) === String(this.destinationWarehouse)
  ) {
    this.invalidate(
      "destinationWarehouse",
      "Destination warehouse must differ from source warehouse.",
    );
  }

  next();
});

module.exports = mongoose.model("Transfer", transferSchema);
