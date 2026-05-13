const validEnvs = ["development", "production", "test"] as const;

type NodeEnv = typeof validEnvs[number];

// 🔥 Validate NODE_ENV
const NODE_ENV = process.env.NODE_ENV as NodeEnv;

if (!NODE_ENV || !validEnvs.includes(NODE_ENV)) {
  throw new Error(
    `❌ Invalid NODE_ENV: ${process.env.NODE_ENV}. Must be one of: ${validEnvs.join(", ")}`
  );
}

// 🔥 Validate PORT
const PORT = process.env.PORT;

if (!PORT || isNaN(Number(PORT))) {
  throw new Error("❌ PORT must be a valid number");
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

if (ALLOWED_ORIGINS.length === 0) {
  throw new Error("❌ ALLOWED_ORIGINS must be set in the environment variables");
}

const allowedOrigins = ALLOWED_ORIGINS;

export const env = {
  NODE_ENV,
  port: Number(PORT),
  allowedOrigins,

  isDev: NODE_ENV === "development",
  isProd: NODE_ENV === "production",
  isTest: NODE_ENV === "test",
};