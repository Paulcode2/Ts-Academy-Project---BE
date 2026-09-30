const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
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
    quantity: {
      type: Number,
      required: [true, "Quantity is required."],
      min: [0, "Quantity must be non-negative."],
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

inventorySchema.index({ product: 1, location: 1 }, { unique: true });
inventorySchema.index({ warehouse: 1, product: 1 });

inventorySchema.pre("validate", async function (next) {
  if (!this.location || !this.warehouse) {
    return next();
  }

  try {
    const Location = mongoose.models.Location || require("./Location");
    const locationDoc = await Location.findById(this.location).lean();

    if (
      locationDoc &&
      String(locationDoc.warehouse) !== String(this.warehouse)
    ) {
      this.invalidate(
        "warehouse",
        "Warehouse must match the selected location's warehouse.",
      );
    }

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Inventory", inventorySchema);
