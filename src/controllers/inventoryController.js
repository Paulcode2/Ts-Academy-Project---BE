const { asyncHandler, successResponse } = require("../utils");
const service = require("../services/inventoryService");

const handler = (operation, message, statusCode = 200) =>
  asyncHandler(async (req, res) => {
    const result = await operation(req);
    if (result?.pagination) return res.status(statusCode).json(result);
    return res.status(statusCode).json(successResponse(message, result));
  });

module.exports = {
  listInventory: handler(service.listInventory, "Inventory retrieved successfully."),
  getInventory: handler(service.getInventory, "Inventory record retrieved successfully."),
  stockIn: handler(service.stockIn, "Stock received successfully.", 201),
  stockOut: handler(service.stockOut, "Stock issued successfully.", 201),
  adjustStock: handler(service.adjustStock, "Stock adjusted successfully.", 201),
  listMovements: handler(service.listMovements, "Stock movements retrieved successfully."),
  getMovement: handler(service.getMovement, "Stock movement retrieved successfully."),
};
