const express = require("express");
const rateLimit = require("express-rate-limit");

const authController = require("../controllers/authController");
const { authenticate, requireActiveUser } = require("../middleware/auth");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
    data: null,
  },
});

router.post("/login", authLimiter, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get(
  "/me",
  authenticate,
  requireActiveUser,
  authController.getCurrentUser,
);
router.patch(
  "/change-password",
  authenticate,
  requireActiveUser,
  authController.changePassword,
);

module.exports = router;
