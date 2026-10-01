const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const accessSecret = process.env.JWT_ACCESS_SECRET;
const refreshSecret = process.env.JWT_REFRESH_SECRET;
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
  const access = process.env.JWT_ACCESS_SECRET;
  const refresh = process.env.JWT_REFRESH_SECRET;
  const production = process.env.NODE_ENV === "production";

  if (!access || !refresh) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required.");
  }

  if (accessSecret.length < 32 || refreshSecret.length < 32) {
    throw new Error("JWT secrets must be at least 32 characters long.");
  }

  if (accessSecret === refreshSecret) {
    throw new Error("JWT access and refresh secrets must be different.");
  }

  if (
    production &&
    [access, refresh].some(
      (secret) =>
        /replace|change|example|placeholder|password/i.test(secret) ||
        new Set(secret).size < 16,
    )
  ) {
    throw new Error(
      "Production JWT secrets must be unique, random values and must not use placeholders.",
    );
  }

  for (const [name, value] of [
    ["JWT_ACCESS_EXPIRES_IN", accessExpiresIn],
    ["JWT_REFRESH_EXPIRES_IN", refreshExpiresIn],
  ]) {
    if (!/^[1-9]\d*[smhd]$/i.test(value)) {
      throw new Error(`${name} must be a positive duration such as 15m or 7d.`);
    }
  }
};

const signToken = (payload, secret, expiresIn) =>
  jwt.sign(payload, secret, { expiresIn, algorithm: "HS256" });

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
      jti: crypto.randomUUID(),
    },
    refreshSecret,
    refreshExpiresIn,
  );

const verifyAccessToken = (token) =>
  jwt.verify(token, accessSecret, { algorithms: ["HS256"] });
const verifyRefreshToken = (token) =>
  jwt.verify(token, refreshSecret, { algorithms: ["HS256"] });

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
