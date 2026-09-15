import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved the connection URL out of schema.prisma.
 *
 * A `datasource` block may no longer carry `url`; migration and introspection
 * commands read it from here instead, and the runtime client connects through
 * a driver adapter (see src/lib/db/prisma.ts).
 *
 * The Prisma CLI only reads `.env`, while Next reads `.env.local` first. Going
 * through Next's own loader keeps DATABASE_URL in a single file with a single
 * precedence order, instead of one copy per tool that drifts out of sync.
 */
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // Run by `prisma migrate dev` and `prisma migrate reset` once the schema
    // is applied, so a fresh database always ends up with an admin who can
    // sign in. It no-ops unless ADMIN_EMAIL and ADMIN_PASSWORD are set.
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    // Read directly rather than through Prisma's `env()` helper, which throws
    // when the variable is absent — that would break `prisma generate`, which
    // needs no connection. Migrate commands report a missing URL themselves.
    url: process.env.DATABASE_URL,
  },
});
