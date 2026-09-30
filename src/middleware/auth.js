const { AppError } = require("../utils");
const { verifyAccessToken } = require("../config/auth");
const { User } = require("../models");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Authentication required.", 401);
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new AppError("User account is not active.", 401);
    }

    req.user = user.toJSON ? user.toJSON() : user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new AppError("Access token expired.", 401));
    }

    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Invalid access token.", 401));
    }

    next(error);
  }
};

const requireActiveUser = (req, res, next) => {
  if (!req.user || !req.user.isActive) {
    return next(new AppError("User account is not active.", 401));
  }

  next();
};

const authorizeRoles =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required.", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError("Access denied.", 403));
    }

    next();
  };

const authorizeWarehouseAccess =
  (warehouseParamName = "warehouseId") =>
  (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required.", 401));
    }

    if (req.user.role === "ADMIN") {
      return next();
    }

    const warehouseId =
      req.params[warehouseParamName] ||
      req.body[warehouseParamName] ||
      req.query[warehouseParamName];

    if (!warehouseId) {
      return next();
    }

    const assignedWarehouses = req.user.assignedWarehouses || [];

    if (!assignedWarehouses.some((id) => String(id) === String(warehouseId))) {
      return next(new AppError("Access denied for this warehouse.", 403));
    }

    next();
  };

module.exports = {
  authenticate,
  requireActiveUser,
  authorizeRoles,
  authorizeWarehouseAccess,
};
