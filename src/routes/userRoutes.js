const express = require("express");
const {
  authenticate,
  requireActiveUser,
  authorizeRoles,
} = require("../middleware/auth");
const userController = require("../controllers/userController");

const router = express.Router();

router.use(authenticate, requireActiveUser, authorizeRoles("ADMIN"));

router.post("/", userController.createUser);
router.get("/", userController.getUsers);
router.get("/:id", userController.getUser);
router.patch("/:id", userController.updateUser);
router.patch("/:id/role", userController.changeUserRole);
router.patch("/:id/warehouses", userController.assignWarehouses);
router.patch("/:id/activate", userController.activateUser);
router.patch("/:id/deactivate", userController.deactivateUser);
router.patch("/:id/reset-password", userController.resetPassword);

module.exports = router;
