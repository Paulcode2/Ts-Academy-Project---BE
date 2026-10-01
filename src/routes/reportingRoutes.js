const express = require("express");
const { authenticate, requireActiveUser } = require("../middleware/auth");
const controller = require("../controllers/reportingController");

const router = express.Router();
const authenticated = [authenticate, requireActiveUser];

router.get("/dashboard/summary", ...authenticated, controller.dashboardSummary);
router.get("/reports/inventory", ...authenticated, controller.inventoryReport);
router.get(
  "/reports/warehouse-inventory",
  ...authenticated,
  controller.warehouseInventoryReport,
);
router.get("/reports/low-stock", ...authenticated, controller.lowStockReport);
router.get(
  "/reports/stock-movements",
  ...authenticated,
  controller.stockMovementReport,
);
router.get("/reports/transfers", ...authenticated, controller.transferReport);

module.exports = router;
