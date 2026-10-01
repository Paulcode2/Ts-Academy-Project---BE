const { errorResponse } = require("../utils/apiResponse");
const {
  handleDuplicateKeyError,
  normalizeMongooseValidationError,
} = require("../utils/errors");

const errorHandler = (error, req, res, next) => {
  const normalizedError =
    error.code === 11000
      ? handleDuplicateKeyError(error)
      : error.name === "ValidationError"
        ? normalizeMongooseValidationError(error)
        : error;
  const statusCode = normalizedError.statusCode || 500;
  const isInternalError = statusCode >= 500;

  const payload = {
    ...errorResponse(
      process.env.NODE_ENV === "production" && isInternalError
        ? "Something went wrong"
        : normalizedError.message || "Something went wrong",
      null,
    ),
  };

  if (
    (!isInternalError || process.env.NODE_ENV !== "production") &&
    normalizedError.details &&
    Object.keys(normalizedError.details).length > 0
  ) {
    payload.details = normalizedError.details;
  }

  if (process.env.NODE_ENV !== "production" && normalizedError.stack) {
    payload.stack = normalizedError.stack;
  }

  if (
    (!isInternalError || process.env.NODE_ENV !== "production") &&
    normalizedError.name === "ValidationError" &&
    normalizedError.errors
  ) {
    payload.errors = normalizedError.errors;
  }

  res.status(statusCode).json(payload);
};

module.exports = errorHandler;
