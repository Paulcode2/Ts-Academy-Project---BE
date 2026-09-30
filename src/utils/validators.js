const mongoose = require("mongoose");

const isValidObjectId = (value) => {
  if (value === null || value === undefined) {
    return false;
  }

  return mongoose.Types.ObjectId.isValid(value);
};

module.exports = {
  isValidObjectId,
};
