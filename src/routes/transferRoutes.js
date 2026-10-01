const express = require("express");
const { authenticate, requireActiveUser } = require("../middleware/auth");
const controller = require("../controllers/transferController");

const router = express.Router();
const authenticated = [authenticate, requireActiveUser];

router.post("/", ...authenticated, controller.createTransfer);
router.get("/", ...authenticated, controller.listTransfers);
router.get("/:transferId", ...authenticated, controller.getTransfer);
router.patch("/:transferId/approve", ...authenticated, controller.approveTransfer);
router.patch("/:transferId/reject", ...authenticated, controller.rejectTransfer);
router.patch("/:transferId/cancel", ...authenticated, controller.cancelTransfer);
router.patch("/:transferId/complete", ...authenticated, controller.completeTransfer);

module.exports = router;
