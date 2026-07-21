import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // The seed is plain ESM JavaScript (prisma/seed.js). env.js reads the app
    // config straight from process.env, so load .env explicitly (Prisma does
    // not inject it into the seed subprocess).
    seed: "node --env-file .env prisma/seed.js",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // Only needed by `prisma migrate diff --from-migrations` (the CI
    // schema-drift check); harmless when unset for every other command.
    ...(process.env["SHADOW_DATABASE_URL"]
      ? { shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"] }
      : {}),
  },
});
