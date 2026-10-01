const express = require("express");
const path = require("node:path");

const router = express.Router();

router.get("/openapi.yaml", (req, res, next) => {
  res.sendFile(path.resolve(__dirname, "../../docs/openapi.yaml"), (error) => {
    if (error) next(error);
  });
});

module.exports = router;
