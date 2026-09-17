import { readMockDirectory } from "@/lib/ad/mockAd";

import type { AdUser } from "./ad";
import { rolesFromGroups } from "./roleMapping";

/**
 * Signing in against the simulated directory.
 *
 * This exists because the demo had a gap that hid a whole layer. `devUsers.ts`
 * writes each account's portal roles out by hand, so the path that actually
 * decides authority in a real deployment — AD group membership resolved through
 * `rolesFromGroups` — was never exercised by signing in. A mapping bug could sit
 * there indefinitely and every demo would still look right.
 *
 * Here the roles come from the account's `groups`, exactly as they would from a
 * domain controller's `memberOf`. Misconfigure `AD_GROUP_*` and you find out at
 * the login screen, which is where you want to find out.
 *
 * Deliberately NOT a method on AdDriver. That interface is the execution
 * contract, and it says in as many words that it exposes no password — a driver
 * that creates and disables accounts must not also hold credentials. So this is
 * a separate reader over the same file.
 *
 * Refused in production, like every other simulated driver in this codebase.
 */

/** The shared demo password. One for every mock account, on purpose. */
const DEFAULT_PASSWORD = "mock12345";

export class MockAdAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockAdAuthError";
  }
}

/** True when the operator has asked for mock directory login. */
export function isMockAdLoginEnabled(): boolean {
  return process.env.MOCK_AD_LOGIN?.trim().toLowerCase() === "true";
}

function password(): string {
  return process.env.MOCK_AD_PASSWORD?.trim() || DEFAULT_PASSWORD;
}

/**
 * Matches what somebody typed against the three names an account answers to.
 *
 * A real bind accepts a UPN or DOMAIN\user and the lookup then resolves the
 * sAMAccountName; mail is accepted too because that is what people actually
 * remember. Being forgiving here costs nothing — the password is still the
 * thing being checked.
 */
function identifies(
  account: { sAMAccountName: string; userPrincipalName: string; mail: string },
  typed: string,
): boolean {
  const needle = typed.trim().toLowerCase();
  if (!needle) return false;

  // Strip a domain qualifier the way authViaLdap does, so `CORP\budi` and
  // `budi@corp.example.com` both reduce to the account name.
  const bare = needle.split("\\").pop()!.split("@")[0];

  return (
    account.sAMAccountName.toLowerCase() === needle ||
    account.sAMAccountName.toLowerCase() === bare ||
    account.userPrincipalName.toLowerCase() === needle ||
    account.mail.toLowerCase() === needle
  );
}

/**
 * Resolves a username and password against the simulated directory.
 *
 * Returns undefined for an unknown account, a wrong password, or a DISABLED
 * one — the caller turns all three away with the same message, so the response
 * never reveals which usernames exist.
 *
 * The disabled case is the one worth having. A Termination request that runs to
 * completion disables the account in this very file, and the person's login
 * stops working as a result rather than as a separate thing somebody remembered
 * to switch off. That is the behaviour the demo could not show before.
 */
export async function authViaMockAd(
  username: string,
  presented: string,
): Promise<AdUser | undefined> {
  if (process.env.NODE_ENV === "production") {
    throw new MockAdAuthError(
      "MOCK_AD_LOGIN ditolak di production. Login direktori simulasi tidak boleh dipakai di lingkungan sungguhan.",
    );
  }

  const accounts = await readMockDirectory();
  const account = accounts.find((candidate) => identifies(candidate, username));
  if (!account) return undefined;

  // Not a constant-time comparison, and it does not need to be: this path only
  // runs outside production against one shared throwaway password.
  if (presented !== password()) return undefined;

  // An account that exists but is switched off is not a way in.
  if (!account.enabled) return undefined;

  return {
    id: account.sAMAccountName,
    username: account.sAMAccountName,
    email: account.mail || account.userPrincipalName,
    fullName: account.displayName || account.sAMAccountName,
    // The whole point: authority comes from group membership, resolved by the
    // same function a real domain controller's memberOf goes through.
    roles: rolesFromGroups(account.groups),
    department: account.department || undefined,
  };
}
