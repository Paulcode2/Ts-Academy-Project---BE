const { asyncHandler, successResponse } = require("../utils");
const service = require("../services/transferService");

const handler = (operation, message, statusCode = 200) =>
  asyncHandler(async (req, res) => {
    const result = await operation(req);
    if (result?.pagination) return res.status(statusCode).json(result);
    return res.status(statusCode).json(successResponse(message, result));
  });

module.exports = {
  createTransfer: handler(service.createTransfer, "Transfer requested successfully.", 201),
  listTransfers: handler(service.listTransfers, "Transfers retrieved successfully."),
  getTransfer: handler(service.getTransfer, "Transfer retrieved successfully."),
  approveTransfer: handler(service.approveTransfer, "Transfer approved successfully."),
  rejectTransfer: handler(service.rejectTransfer, "Transfer rejected successfully."),
  cancelTransfer: handler(service.cancelTransfer, "Transfer cancelled successfully."),
  completeTransfer: handler(service.completeTransfer, "Transfer completed successfully."),
};
