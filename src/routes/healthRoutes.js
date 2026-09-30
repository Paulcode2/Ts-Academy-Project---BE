const express = require("express");
const mongoose = require("mongoose");
const { successResponse } = require("../utils/apiResponse");

const router = express.Router();

router.get("/health", (req, res) => {
  const databaseStatus =
    mongoose.connection.readyState === 1 ? "connected" : "disconnected";

  res.status(200).json({
    ...successResponse("Health check passed", {
      environment: process.env.NODE_ENV || "development",
      serverStatus: "running",
      databaseStatus,
      timestamp: new Date().toISOString(),
    }),
    environment: process.env.NODE_ENV || "development",
    serverStatus: "running",
    databaseStatus,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
