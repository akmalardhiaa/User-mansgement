// @next/env ships CommonJS, so a named ESM import of it fails at module
// instantiation. prisma.config.ts gets away with the named form because Prisma
// loads that file through a bundler that adds the interop; this runs under bare
// node, which does not.
import nextEnv from "@next/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const { loadEnvConfig } = nextEnv;

/**
 * Creates the first ADMIN account.
 *
 * Plain JavaScript rather than TypeScript on purpose: this runs under bare
 * `node`, outside the Next build, and a .ts entry point would drag in a loader
 * or a build step to save a few type annotations it does not need.
 *
 * Credentials come from the environment, never from a literal in this file. A
 * default admin password committed to a repository is a published credential,
 * and it is always still in place months later.
 *
 * Safe to run more than once: an existing account with the same email is left
 * alone rather than reset, so re-running after a migration cannot silently
 * change a password someone is using.
 */

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const MIN_PASSWORD_LENGTH = 8;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `\n  ${name} is not set.\n\n` +
        `  Seed the first admin with:\n` +
        `    ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=your-password ADMIN_NAME="Your Name" npm run db:seed\n`,
    );
    process.exit(1);
  }
  return value;
}

async function main() {
  const connectionString = required("DATABASE_URL");
  const email = required("ADMIN_EMAIL").toLowerCase();
  const password = required("ADMIN_PASSWORD");
  const fullName = process.env.ADMIN_NAME?.trim() || "Administrator";

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`\n  ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.\n`);
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      console.info(`  ${email} already exists (role ${existing.role}) — left unchanged.`);
      return;
    }

    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        password: await bcrypt.hash(password, 12),
        role: "ADMIN",
        // Verified on creation: this account is being made by whoever controls
        // the server, so there is nothing for a confirmation mail to prove, and
        // requiring one would mean the first admin cannot sign in until SMTP
        // works.
        emailVerified: true,
      },
    });

    console.info(`  Created ADMIN ${user.email} (${user.fullName}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
