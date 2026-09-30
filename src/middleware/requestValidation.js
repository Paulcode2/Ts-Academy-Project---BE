const { parsePagination, AppError } = require("../utils");

const validatePagination = (req, res, next) => {
  const { page, limit } = parsePagination(req.query);

  req.pagination = { page, limit };
  next();
};

const validateObjectId = (fieldName) => (req, res, next) => {
  const value = req.params[fieldName] || req.query[fieldName];

  if (!value || !require("mongoose").Types.ObjectId.isValid(value)) {
    return next(new AppError("Invalid object id.", 400, { field: fieldName }));
  }

  next();
};

module.exports = {
  validatePagination,
  validateObjectId,
};
