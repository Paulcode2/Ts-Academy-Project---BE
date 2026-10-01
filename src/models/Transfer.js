const mongoose = require("mongoose");
const { TRANSFER_STATUS_VALUES } = require("../constants");
const validateActiveReference = require("./activeReferenceValidation");

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

transferSchema.pre("validate", async function (next) {
  if (
    this.sourceLocation &&
    this.destinationLocation &&
    String(this.sourceLocation) === String(this.destinationLocation)
  ) {
    this.invalidate(
      "destinationLocation",
      "Destination location must differ from source location.",
    );
  }

  try {
    const references = await Promise.all([
      validateActiveReference(this, "product", "Product"),
      validateActiveReference(this, "sourceWarehouse", "Warehouse"),
      validateActiveReference(this, "sourceLocation", "Location"),
      validateActiveReference(this, "destinationWarehouse", "Warehouse"),
      validateActiveReference(this, "destinationLocation", "Location"),
    ]);
    const [
      ,
      sourceWarehouse,
      sourceLocation,
      destinationWarehouse,
      destinationLocation,
    ] = references;
    if (
      sourceLocation &&
      sourceWarehouse &&
      String(sourceLocation.warehouse) !== String(this.sourceWarehouse)
    ) {
      this.invalidate(
        "sourceWarehouse",
        "Source warehouse must match the source location.",
      );
    }
    if (
      destinationLocation &&
      destinationWarehouse &&
      String(destinationLocation.warehouse) !==
        String(this.destinationWarehouse)
    ) {
      this.invalidate(
        "destinationWarehouse",
        "Destination warehouse must match the destination location.",
      );
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Transfer", transferSchema);
