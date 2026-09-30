const normalizeSearchString = (value = "") => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
};

module.exports = {
  normalizeSearchString,
};
