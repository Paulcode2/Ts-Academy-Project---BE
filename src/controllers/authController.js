const { AppError, successResponse } = require("../utils");
const {
  loginUser,
  refreshUserSession,
  logoutUser,
  changeUserPassword,
} = require("../services/authService");
const {
  isStrongPassword,
  cookieOptions,
  refreshExpiresIn,
} = require("../config/auth");

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const session = await loginUser({ email, password });

    res.cookie(
      "refreshToken",
      session.refreshToken,
      cookieOptions(refreshExpiresIn),
    );

    return res.status(200).json(
      successResponse("Login successful.", {
        accessToken: session.accessToken,
        user: session.user,
      }),
    );
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const refreshTokenValue = req.cookies.refreshToken;
    const session = await refreshUserSession(refreshTokenValue);

    res.cookie(
      "refreshToken",
      session.refreshToken,
      cookieOptions(refreshExpiresIn),
    );

    return res.status(200).json(
      successResponse("Token refreshed successfully.", {
        accessToken: session.accessToken,
        user: session.user,
      }),
    );
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshTokenValue = req.cookies.refreshToken;
    await logoutUser(refreshTokenValue);

    res.clearCookie("refreshToken", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json(successResponse("Logged out successfully."));
  } catch (error) {
    next(error);
  }
};

const getCurrentUser = async (req, res) => {
  return res
    .status(200)
    .json(successResponse("Current user retrieved successfully.", req.user));
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError(
        "Current password and new password are required.",
        400,
      );
    }

    if (!isStrongPassword(newPassword)) {
      throw new AppError(
        "Password must contain at least 8 characters, including uppercase, lowercase, a number, and a special character.",
        400,
      );
    }

    const updatedUser = await changeUserPassword(
      req.user._id,
      currentPassword,
      newPassword,
    );

    res.clearCookie("refreshToken", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json(
      successResponse("Password changed successfully.", {
        user: updatedUser,
      }),
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  refresh,
  logout,
  getCurrentUser,
  changePassword,
};
