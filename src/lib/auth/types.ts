/**
 * Account-system types.
 *
 * `Role` is declared here as a plain union rather than imported from
 * `@prisma/client` so that proxy.ts — which only ever verifies a token — can
 * use it without pulling the Prisma engine into the request path. Prisma
 * generates its enum as the same union, so the two stay assignment-compatible
 * and a mismatch is a type error rather than a runtime surprise.
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
