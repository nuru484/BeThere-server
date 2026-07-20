import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
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
