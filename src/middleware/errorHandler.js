const { errorResponse } = require("../utils/apiResponse");

const errorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || 500;

  const payload = {
    ...errorResponse(
      process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : error.message || "Something went wrong",
      null,
    ),
  };

  if (process.env.NODE_ENV !== "production" && error.stack) {
    payload.stack = error.stack;
  }

  if (error.name === "ValidationError" && error.errors) {
    payload.errors = error.errors;
  }

  res.status(statusCode).json(payload);
};

module.exports = errorHandler;
