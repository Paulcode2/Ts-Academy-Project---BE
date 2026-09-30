const { successResponse } = require("../utils");
const {
  createUserAccount,
  listUsers,
  getUserById,
  updateUserDetails,
  updateUserRole,
  assignWarehousesToUser,
  toggleUserStatus,
  resetUserPassword,
} = require("../services/userService");

const createUser = async (req, res, next) => {
  try {
    const user = await createUserAccount(req.body);
    return res
      .status(201)
      .json(successResponse("User created successfully.", user));
  } catch (error) {
    next(error);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const payload = await listUsers(req.query);
    return res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
};

const getUser = async (req, res, next) => {
  try {
    const user = await getUserById(req.params.id);
    return res
      .status(200)
      .json(successResponse("User retrieved successfully.", user));
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await updateUserDetails(req.params.id, req.body);
    return res
      .status(200)
      .json(successResponse("User updated successfully.", user));
  } catch (error) {
    next(error);
  }
};

const changeUserRole = async (req, res, next) => {
  try {
    const user = await updateUserRole(req.params.id, req.body.role);
    return res
      .status(200)
      .json(successResponse("User role updated successfully.", user));
  } catch (error) {
    next(error);
  }
};

const assignWarehouses = async (req, res, next) => {
  try {
    const user = await assignWarehousesToUser(
      req.params.id,
      req.body.assignedWarehouses,
    );
    return res
      .status(200)
      .json(successResponse("User warehouses updated successfully.", user));
  } catch (error) {
    next(error);
  }
};

const activateUser = async (req, res, next) => {
  try {
    const user = await toggleUserStatus(req.params.id, true);
    return res
      .status(200)
      .json(successResponse("User activated successfully.", user));
  } catch (error) {
    next(error);
  }
};

const deactivateUser = async (req, res, next) => {
  try {
    const user = await toggleUserStatus(req.params.id, false);
    return res
      .status(200)
      .json(successResponse("User deactivated successfully.", user));
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const user = await resetUserPassword(req.params.id, req.body.newPassword);
    return res
      .status(200)
      .json(successResponse("User password reset successfully.", user));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  changeUserRole,
  assignWarehouses,
  activateUser,
  deactivateUser,
  resetPassword,
};
