const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required."],
      index: true,
    },
    tokenHash: {
      type: String,
      required: [true, "Token hash is required."],
      trim: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration date is required."],
      index: true,
    },
    revokedAt: Date,
    revoked: {
      type: Boolean,
      default: false,
    },
    userAgent: String,
    ipAddress: String,
  },
  {
    timestamps: true,
  },
);

refreshTokenSchema.index({ user: 1, tokenHash: 1 }, { unique: true });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
