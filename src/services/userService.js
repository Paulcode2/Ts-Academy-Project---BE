const { User, Warehouse } = require("../models");
const {
  AppError,
  parsePagination,
  buildPaginatedResponse,
} = require("../utils");
const { isStrongPassword } = require("../config/auth");

const normalizeAssignedWarehouses = (warehouseIds = []) => [
  ...new Set((warehouseIds || []).map((id) => String(id))),
];

const createUserAccount = async ({
  firstName,
  lastName,
  email,
  password,
  role,
  assignedWarehouses = [],
  isActive = true,
}) => {
  if (!firstName || !lastName || !email || !password) {
    throw new AppError(
      "First name, last name, email and password are required.",
      400,
    );
  }

  if (!isStrongPassword(password)) {
    throw new AppError(
      "Password must contain at least 8 characters, including uppercase, lowercase, a number, and a special character.",
      400,
    );
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    password,
    role,
    assignedWarehouses: normalizeAssignedWarehouses(assignedWarehouses),
    isActive,
  });

  return user.toJSON();
};

const listUsers = async (query = {}) => {
  const { page, limit } = parsePagination(query);
  const filters = {};

  if (query.role) {
    filters.role = query.role;
  }

  if (query.isActive !== undefined) {
    filters.isActive = query.isActive === "true";
  }

  if (query.search) {
    const searchText = String(query.search).trim();
    filters.$or = [
      { firstName: { $regex: searchText, $options: "i" } },
      { lastName: { $regex: searchText, $options: "i" } },
      { email: { $regex: searchText, $options: "i" } },
    ];
  }

  const totalItems = await User.countDocuments(filters);
  const users = await User.find(filters)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return buildPaginatedResponse({
    message: "Users retrieved successfully.",
    data: users,
    page,
    limit,
    totalItems,
  });
};

const getUserById = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  return user;
};

const updateUserDetails = async (userId, updates) => {
  const allowedFields = ["firstName", "lastName", "email", "isActive"];
  const filteredUpdates = {};

  for (const [field, value] of Object.entries(updates)) {
    if (allowedFields.includes(field)) {
      filteredUpdates[field] = value;
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    throw new AppError("No valid user fields were provided.", 400);
  }

  const user = await User.findByIdAndUpdate(userId, filteredUpdates, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  return user.toJSON();
};

const updateUserRole = async (userId, role) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { role },
    { new: true, runValidators: true },
  );

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  return user.toJSON();
};

const assignWarehousesToUser = async (userId, warehouseIds) => {
  const normalizedIds = normalizeAssignedWarehouses(warehouseIds);

  if (!normalizedIds.length) {
    throw new AppError("At least one warehouse id is required.", 400);
  }

  const warehouseCount = await Warehouse.countDocuments({
    _id: { $in: normalizedIds },
  });

  if (warehouseCount !== normalizedIds.length) {
    throw new AppError("One or more warehouse ids are invalid.", 400);
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { assignedWarehouses: normalizedIds },
    { new: true, runValidators: true },
  );

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  return user.toJSON();
};

const toggleUserStatus = async (userId, isActive) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { isActive },
    { new: true, runValidators: true },
  );

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  return user.toJSON();
};

const resetUserPassword = async (userId, newPassword) => {
  if (!newPassword || !isStrongPassword(newPassword)) {
    throw new AppError(
      "Password must contain at least 8 characters, including uppercase, lowercase, a number, and a special character.",
      400,
    );
  }

  const user = await User.findById(userId).select("+password");

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  user.password = newPassword;
  await user.save();
  await require("../models").RefreshToken.deleteMany({ user: user._id });

  return user.toJSON();
};

module.exports = {
  createUserAccount,
  listUsers,
  getUserById,
  updateUserDetails,
  updateUserRole,
  assignWarehousesToUser,
  toggleUserStatus,
  resetUserPassword,
};
