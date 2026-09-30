const successResponse = (message, data = {}, extra = {}) => ({
  success: true,
  message,
  data,
  ...extra,
});

const errorResponse = (message, data = null, extra = {}) => ({
  success: false,
  message,
  data,
  ...extra,
});

module.exports = {
  successResponse,
  errorResponse,
};
