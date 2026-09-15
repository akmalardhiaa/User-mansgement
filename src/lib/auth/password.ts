import bcrypt from "bcryptjs";

/**
 * Password hashing.
 *
 * bcryptjs rather than the native `bcrypt` binding: same algorithm and same
 * hash format, but pure JavaScript, so the project installs on Windows without
 * a C++ toolchain and deploys to serverless runtimes that cannot load native
 * modules. Hashes written by either library are interchangeable.
 */

/**
 * Work factor. 12 is roughly 250ms on current hardware — slow enough to make
 * offline cracking expensive, fast enough that a login still feels instant.
 * Raise it as hardware improves; existing hashes keep their original cost and
 * are re-hashed on next successful login.
 */
const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

/**
 * Compares a candidate password against a stored hash.
 *
 * bcrypt.compare is constant-time with respect to the hash, so a wrong
 * password reveals nothing through timing.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // A malformed hash in the database should read as "wrong password", not
    // as a 500 that tells the caller something is broken with this account.
    return false;
  }
}

/**
 * Burns roughly the same time as a real comparison.
 *
 * Login calls this when the email is unknown. Without it, "no such account"
 * returns in microseconds while a wrong password takes ~250ms, and that gap
 * alone tells an attacker which addresses are registered.
 */
export async function fakeVerifyPassword(): Promise<false> {
  await bcrypt.compare("timing-equaliser", "$2a$12$K9yLZ8Qx0vUu5r1sT3eWQeJH1Z9m1nQ5vXwYzAbCdEfGhIjKlMnOp");
  return false;
}

/** True when a hash was written with a weaker work factor than ROUNDS. */
export function needsRehash(hash: string): boolean {
  const cost = Number(hash.split("$")[2]);
  return Number.isFinite(cost) && cost < ROUNDS;
}
