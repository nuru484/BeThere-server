export function assertEnv(value, name) {
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const ENV = {
  PORT: process.env.PORT || 8080,
  NODE_ENV: process.env.NODE_ENV || "development",
  CORS_ACCESS: process.env.CORS_ACCESS,
  DATABASE_URL: assertEnv(process.env.DATABASE_URL, "DATABASE_URL"),

  ADMIN_EMAIL: assertEnv(process.env.ADMIN_EMAIL, "ADMIN_EMAIL"),
  ADMIN_PASSWORD: assertEnv(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD"),
  ADMIN_FIRSTNAME: assertEnv(process.env.ADMIN_FIRSTNAME, "ADMIN_FIRSTNAME"),
  ADMIN_LASTNAME: assertEnv(process.env.ADMIN_LASTNAME, "ADMIN_LASTNAME"),
  ADMIN_PHONE: process.env.ADMIN_PHONE,

  ACCESS_TOKEN_SECRET: assertEnv(
    process.env.ACCESS_TOKEN_SECRET,
    "ACCESS_TOKEN_SECRET"
  ),
  REFRESH_TOKEN_SECRET: assertEnv(
    process.env.REFRESH_TOKEN_SECRET,
    "REFRESH_TOKEN_SECRET"
  ),

  CLOUDINARY_CLOUD_NAME: assertEnv(
    process.env.CLOUDINARY_CLOUD_NAME,
    "CLOUDINARY_CLOUD_NAME"
  ),

  CLOUDINARY_API_KEY: assertEnv(
    process.env.CLOUDINARY_API_KEY,
    "CLOUDINARY_API_KEY"
  ),

  CLOUDINARY_API_SECRET: assertEnv(
    process.env.CLOUDINARY_API_SECRET,
    "CLOUDINARY_API_SECRET"
  ),

  REDIS_URL: assertEnv(process.env.REDIS_URL, "REDIS_URL"),

  FRONTEND_URL: assertEnv(process.env.FRONTEND_URL, "FRONTEND_URL"),
};

export default ENV;
