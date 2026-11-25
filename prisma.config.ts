// prisma.config.ts
//
// Prisma configuration file. Defines the schema location, migration strategy,
// and database connection URL (via env var).
//
// Note: This file is only used by the Prisma CLI, not at runtime in the app.
// Runtime database connections are configured in lib/prisma.ts.

import "dotenv/config"; 
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
    datasource: {
    url: env("DATABASE_URL"),
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: env("SHADOW_DATABASE_URL") }
      : {}),
  },
});