const { User, RefreshToken } = require("../models");
const {
  createAccessToken,
  createRefreshToken,
  hashToken,
  verifyRefreshToken,
  cookieOptions,
  parseDurationToMs,
  refreshExpiresIn,
} = require("../config/auth");
const { AppError } = require("../utils");

const buildAuthResponse = (user, accessToken, refreshToken) => ({
  accessToken,
  refreshToken,
  user: user.toJSON ? user.toJSON() : user,
});

const loginUser = async ({ email, password }) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail || !password) {
    throw new AppError("Invalid email or password.", 401);
  }

  const user = await User.findOne({ email: normalizedEmail }).select(
    "+password",
  );

  if (!user || !user.isActive || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password.", 401);
  }

  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  await RefreshToken.deleteMany({ user: user._id });
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + parseDurationToMs(refreshExpiresIn)),
    userAgent: "backend-session",
  });

  user.lastLoginAt = new Date();
  await user.save();

  return {
    accessToken,
    refreshToken,
    user: user.toJSON(),
  };
};

const refreshUserSession = async (refreshTokenValue) => {
  if (!refreshTokenValue) {
    throw new AppError("Refresh token is required.", 401);
  }

  let payload;

  try {
    payload = verifyRefreshToken(refreshTokenValue);
  } catch (error) {
    throw new AppError("Refresh token is invalid or expired.", 401);
  }
  if (payload.type !== "refresh" || !payload.sub) {
    throw new AppError("Refresh token is invalid or expired.", 401);
  }

  const user = await User.findById(payload.sub);

  if (!user || !user.isActive) {
    throw new AppError("User account is not active.", 401);
  }

  const tokenHash = hashToken(refreshTokenValue);
  const storedSession = await RefreshToken.findOneAndDelete({
    user: user._id,
    tokenHash,
    revoked: false,
    expiresAt: { $gt: new Date() },
  });

  if (!storedSession) {
    throw new AppError("Refresh token is invalid or revoked.", 401);
  }

  const newAccessToken = createAccessToken(user);
  const newRefreshToken = createRefreshToken(user);

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(newRefreshToken),
    expiresAt: new Date(Date.now() + parseDurationToMs(refreshExpiresIn)),
    userAgent: "backend-session",
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: user.toJSON(),
  };
};

const logoutUser = async (refreshTokenValue) => {
  if (!refreshTokenValue) {
    return { revoked: false };
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenValue);
  } catch (error) {
    return { revoked: false };
  }
  if (payload.type !== "refresh" || !payload.sub) {
    return { revoked: false };
  }
  const result = await RefreshToken.deleteOne({
    user: payload.sub,
    tokenHash: hashToken(refreshTokenValue),
  });
  return { revoked: result.deletedCount > 0 };
};

const changeUserPassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select("+password");

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  const isCurrentPasswordValid = await user.comparePassword(currentPassword);

  if (!isCurrentPasswordValid) {
    throw new AppError("Current password is incorrect.", 401);
  }

  await RefreshToken.deleteMany({ user: user._id });
  user.password = newPassword;
  await user.save();

  return user.toJSON();
};

module.exports = {
  loginUser,
  refreshUserSession,
  logoutUser,
  changeUserPassword,
  buildAuthResponse,
  cookieOptions,
};
