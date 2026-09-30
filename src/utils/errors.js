class AppError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

const handleDuplicateKeyError = (error) => {
  const key = Object.keys(error?.keyValue || {})[0];

  if (!key) {
    return new AppError("Duplicate record detected.", 409);
  }

  const fieldName = key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

  const message =
    fieldName === "Email"
      ? "A record with the same email already exists."
      : `A record with the same ${fieldName.toLowerCase()} already exists.`;

  return new AppError(message, 409, {
    field: key,
    value: error.keyValue[key],
  });
};

const normalizeMongooseValidationError = (error) => {
  const details = {};

  for (const [field, fieldError] of Object.entries(error?.errors || {})) {
    details[field] = fieldError.message;
  }

  return new AppError("Validation failed", 400, details);
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  AppError,
  handleDuplicateKeyError,
  normalizeMongooseValidationError,
  asyncHandler,
};
