/**
 * The HC accounts allowed into the dashboard.
 *
 * Configured entirely through `HC_AUTH_USERS`, as `email:password:Name` triples
 * separated by commas. This is a deliberately small stand-in for a real
 * identity provider: it gives each HC officer their own login so the audit
 * trail records who did what, but it has no password reset, no lockout and no
 * MFA. Put SSO in front of this before it holds anything sensitive.
 */

export interface AuthUser {
  email: string;
  password: string;
  name: string;
}

export function getAuthUsers(): AuthUser[] {
  const raw = process.env.HC_AUTH_USERS?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [email, password, ...nameParts] = entry.split(":");
      return {
        email: (email ?? "").trim().toLowerCase(),
        password: (password ?? "").trim(),
        name: nameParts.join(":").trim() || (email ?? "").trim(),
      };
    })
    .filter((user) => user.email && user.password);
}

/** True when no accounts are configured, so the app can say so instead of silently rejecting everyone. */
export function isAuthConfigured(): boolean {
  return getAuthUsers().length > 0 && Boolean(process.env.AUTH_SECRET?.trim());
}

/** Compares two strings in constant time, so a wrong password leaks no timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  // Comparing lengths first is safe: password length is not the secret.
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

export function verifyCredentials(email: string, password: string): AuthUser | undefined {
  const wanted = email.trim().toLowerCase();
  const user = getAuthUsers().find((candidate) => candidate.email === wanted);
  if (!user) return undefined;
  return constantTimeEquals(user.password, password) ? user : undefined;
}
