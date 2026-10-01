const normalizeSearchString = (value = "") => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
};

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = {
  normalizeSearchString,
  escapeRegex,
};
