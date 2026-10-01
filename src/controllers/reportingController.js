const { asyncHandler, successResponse } = require("../utils");
const service = require("../services/reportingService");

const handler = (operation, message) =>
  asyncHandler(async (req, res) => {
    const result = await operation(req);
    if (result?.pagination) return res.status(200).json(result);
    return res.status(200).json(successResponse(message, result));
  });

module.exports = {
  dashboardSummary: handler(
    service.dashboardSummary,
    "Dashboard summary retrieved successfully.",
  ),
  inventoryReport: handler(service.inventory, "Inventory report retrieved successfully."),
  warehouseInventoryReport: handler(
    service.warehouseInventory,
    "Warehouse inventory report retrieved successfully.",
  ),
  lowStockReport: handler(service.lowStock, "Low-stock report retrieved successfully."),
  stockMovementReport: handler(
    service.stockMovements,
    "Stock movement report retrieved successfully.",
  ),
  transferReport: handler(service.transfers, "Transfer report retrieved successfully."),
};
