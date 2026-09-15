import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter — the old "url in schema.prisma, engine
 * dials the database itself" path is gone, so the connection string is handed
 * to `@prisma/adapter-pg` here and the CLI reads its own copy through
 * prisma.config.ts.
 *
 * `next dev` hot-reloads modules on every edit. Without the global cache each
 * reload would construct another client, and each client opens its own
 * connection pool — Postgres starts refusing connections after a few dozen
 * edits. Production builds get a fresh module graph per instance, so the
 * global only matters in development.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The account system cannot reach Postgres. See .env.example.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * The client is constructed on first property access, not at import time.
 *
 * `next build` imports every route module to collect its metadata. Building a
 * client at module scope would therefore make a missing DATABASE_URL fail the
 * whole build, including for the many routes that never touch Postgres.
 * Deferring it means the error surfaces from the request that actually needed
 * the database, naming the variable.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = globalForPrisma.prisma ?? createClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;

    const value = Reflect.get(client, property) as unknown;
    // Bound to the real client, never to the proxy: Prisma's methods read
    // private fields off `this`, which a proxy receiver would not carry.
    return typeof value === "function" ? value.bind(client) : value;
  },
});
