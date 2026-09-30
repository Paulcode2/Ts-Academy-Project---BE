const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const DEFAULT_ACCESS_SECRET = "dev_access_secret_change_me_1234567890";
const DEFAULT_REFRESH_SECRET = "dev_refresh_secret_change_me_1234567890";

const accessSecret = process.env.JWT_ACCESS_SECRET || DEFAULT_ACCESS_SECRET;
const refreshSecret = process.env.JWT_REFRESH_SECRET || DEFAULT_REFRESH_SECRET;
const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

const parseDurationToMs = (duration) => {
  const match = /^([0-9]+)([smhd])$/.exec(
    String(duration).trim().toLowerCase(),
  );

  if (!match) {
    return 15 * 60 * 1000;
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] || 1000);
};

const validateAuthEnvironment = () => {
  if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
    console.warn(
      "JWT secrets are using default development values. Override them in production.",
    );
  }

  if (accessSecret.length < 32 || refreshSecret.length < 32) {
    throw new Error("JWT secrets must be at least 32 characters long.");
  }
};

const signToken = (payload, secret, expiresIn) =>
  jwt.sign(payload, secret, { expiresIn });

const createAccessToken = (user) =>
  signToken(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    accessSecret,
    accessExpiresIn,
  );

const createRefreshToken = (user) =>
  signToken(
    {
      sub: user._id.toString(),
      email: user.email,
      type: "refresh",
    },
    refreshSecret,
    refreshExpiresIn,
  );

const verifyAccessToken = (token) => jwt.verify(token, accessSecret);
const verifyRefreshToken = (token) => jwt.verify(token, refreshSecret);

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const isStrongPassword = (password) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);

const cookieOptions = (expiresIn) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: parseDurationToMs(expiresIn),
});

module.exports = {
  validateAuthEnvironment,
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  isStrongPassword,
  cookieOptions,
  parseDurationToMs,
  accessExpiresIn,
  refreshExpiresIn,
};
