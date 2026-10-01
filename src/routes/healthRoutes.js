const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

router.get("/health", (req, res) => {
  const databaseStatus = mongoose.connection.readyState === 1
    ? "connected"
    : "disconnected";
  const success = databaseStatus === "connected";
  const statusCode = success ? 200 : 503;
  const health = {
    environment: process.env.NODE_ENV || "development",
    serverStatus: "running",
    databaseStatus,
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json({
    success,
    message: success
      ? "Health check passed"
      : "Health check failed: database unavailable",
    data: health,
    ...health,
  });
});

module.exports = router;
