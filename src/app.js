const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const healthRoutes = require("./routes/healthRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const masterDataRoutes = require("./routes/masterDataRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const transferRoutes = require("./routes/transferRoutes");
const reportingRoutes = require("./routes/reportingRoutes");
const documentationRoutes = require("./routes/documentationRoutes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const allowedOrigins = () => {
  const rawOrigins = process.env.FRONTEND_URL || "";

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      const origins = allowedOrigins();

      if (!origin || origins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  }),
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests",
      data: null,
    },
  }),
);
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb", parameterLimit: 100 }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    req.body = {};
  }
  next();
});
app.use(cookieParser());

app.use("/api/v1", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1", documentationRoutes);
app.use("/api/v1", masterDataRoutes);
app.use("/api/v1", inventoryRoutes);
app.use("/api/v1/transfers", transferRoutes);
app.use("/api/v1", reportingRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
