/**
 * Session types.
 *
 * `Role` is a plain union. The app has no database: roles come from Active
 * Directory group membership (see src/lib/auth/ad.ts) and are carried inside
 * the signed session token, so nothing here reaches for a data layer.
 */

export const ROLES = ["USER", "ADMIN"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** What a signed access token carries. Registered claims use their JWT names. */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  email: string;
  fullName: string;
  role: Role;
  /** Issued at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. */
  exp: number;
}

/** The account shape that leaves the API — never includes `password`. */
export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}
