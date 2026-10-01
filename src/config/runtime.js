const validateRuntimeEnvironment = (env = process.env) => {
  if (!["development", "production"].includes(env.NODE_ENV)) {
    throw new Error(
      "Set NODE_ENV explicitly to development or production before starting the server.",
    );
  }

  const port = env.PORT === undefined || env.PORT === ""
    ? 5000
    : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const frontendOrigins = String(env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (env.NODE_ENV === "production") {
    if (frontendOrigins.length === 0) {
      throw new Error(
        "FRONTEND_URL must contain the production frontend origin.",
      );
    }
    for (const origin of frontendOrigins) {
      let parsedOrigin;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw new Error("FRONTEND_URL must contain valid origins.");
      }
      if (
        parsedOrigin.protocol !== "https:" ||
        parsedOrigin.origin !== origin
      ) {
        throw new Error(
          "Each production FRONTEND_URL must be an HTTPS origin without a path.",
        );
      }
    }
  }

  return { port, frontendOrigins };
};

module.exports = { validateRuntimeEnvironment };
