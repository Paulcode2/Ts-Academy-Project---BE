const { errorResponse } = require("../utils/apiResponse");

const notFound = (req, res) => {
  res.status(404).json(
    errorResponse("Resource not found", null, {
      path: req.originalUrl,
    }),
  );
};

module.exports = notFound;
