const express = require("express");
const {
  authenticate,
  requireActiveUser,
  authorizeRoles,
} = require("../middleware/auth");
const controller = require("../controllers/inventoryController");

const router = express.Router();
const authenticated = [authenticate, requireActiveUser];

router.get("/inventory/low-stock", ...authenticated, (req, res, next) => {
  req.inventoryStockStatus = "LOW_STOCK";
  next();
}, controller.listInventory);
router.get("/inventory/out-of-stock", ...authenticated, (req, res, next) => {
  req.inventoryStockStatus = "OUT_OF_STOCK";
  next();
}, controller.listInventory);
router.get("/inventory", ...authenticated, controller.listInventory);
router.get("/inventory/:inventoryId", ...authenticated, controller.getInventory);

router.post("/stock-movements/stock-in", ...authenticated, controller.stockIn);
router.post("/stock-movements/stock-out", ...authenticated, controller.stockOut);
router.post(
  "/stock-movements/adjust",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.adjustStock,
);
router.get("/stock-movements", ...authenticated, controller.listMovements);
router.get(
  "/stock-movements/:movementId",
  ...authenticated,
  controller.getMovement,
);

module.exports = router;
