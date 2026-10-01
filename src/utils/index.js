const { successResponse, errorResponse } = require("./apiResponse");
const { buildPaginatedResponse, parsePagination } = require("./pagination");
const { normalizeSearchString, escapeRegex } = require("./search");
const { validateDateRange } = require("./dateRange");
const { isValidObjectId } = require("./validators");
const {
  AppError,
  handleDuplicateKeyError,
  normalizeMongooseValidationError,
  asyncHandler,
} = require("./errors");

module.exports = {
  successResponse,
  errorResponse,
  buildPaginatedResponse,
  parsePagination,
  normalizeSearchString,
  escapeRegex,
  validateDateRange,
  isValidObjectId,
  AppError,
  handleDuplicateKeyError,
  normalizeMongooseValidationError,
  asyncHandler,
};
