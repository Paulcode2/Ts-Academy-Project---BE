const USER_ROLES = Object.freeze({
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
});

const USER_ROLE_VALUES = Object.values(USER_ROLES);

module.exports = {
  USER_ROLES,
  USER_ROLE_VALUES,
};
