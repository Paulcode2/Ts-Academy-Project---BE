const mongoose = require("mongoose");

const validateActiveReference = async (document, field, modelName) => {
  const referenceId = document[field];
  if (!referenceId) return null;

  const Model = mongoose.models[modelName];
  const reference = await Model.findById(referenceId)
    .select("isActive warehouse category")
    .lean();
  if (!reference) {
    document.invalidate(
      field,
      `${field} must reference an existing ${modelName.toLowerCase()}.`,
    );
    return null;
  }

  if (!reference.isActive) {
    document.invalidate(
      field,
      `${field} must reference an active ${modelName.toLowerCase()}.`,
    );
  }

  return reference;
};

module.exports = validateActiveReference;
