const express = require("express");
const {
  authenticate,
  requireActiveUser,
  authorizeRoles,
} = require("../middleware/auth");
const controller = require("../controllers/masterDataController");

const router = express.Router();

const authenticated = [authenticate, requireActiveUser];

router.post(
  "/warehouses",
  ...authenticated,
  authorizeRoles("ADMIN"),
  controller.createWarehouse,
);
router.get("/warehouses", ...authenticated, controller.listWarehouses);
router.get(
  "/warehouses/:warehouseId",
  ...authenticated,
  controller.getWarehouse,
);
router.patch(
  "/warehouses/:warehouseId",
  ...authenticated,
  authorizeRoles("ADMIN"),
  controller.updateWarehouse,
);
router.patch(
  "/warehouses/:warehouseId/status",
  ...authenticated,
  authorizeRoles("ADMIN"),
  controller.setWarehouseStatus,
);

router.post(
  "/locations",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.createLocation,
);
router.get("/locations", ...authenticated, controller.listLocations);
router.get("/locations/:locationId", ...authenticated, controller.getLocation);
router.patch(
  "/locations/:locationId",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.updateLocation,
);
router.patch(
  "/locations/:locationId/status",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.setLocationStatus,
);

router.post(
  "/categories",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.createCategory,
);
router.get("/categories", ...authenticated, controller.listCategories);
router.get("/categories/:categoryId", ...authenticated, controller.getCategory);
router.patch(
  "/categories/:categoryId",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.updateCategory,
);
router.patch(
  "/categories/:categoryId/status",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.setCategoryStatus,
);

router.post(
  "/products",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.createProduct,
);
router.get("/products", ...authenticated, controller.listProducts);
router.get("/products/:productId", ...authenticated, controller.getProduct);
router.patch(
  "/products/:productId",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.updateProduct,
);
router.patch(
  "/products/:productId/status",
  ...authenticated,
  authorizeRoles("ADMIN", "MANAGER"),
  controller.setProductStatus,
);

module.exports = router;
