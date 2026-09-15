import type { Role } from "./types";

/**
 * Local fallback accounts, used ONLY when no LDAP server is configured.
 *
 * The app is meant to authenticate against Active Directory (see ad.ts). Until
 * an `LDAP_URL` is set, these let the portal be opened and demoed locally.
 * They never work in production: authenticateAD throws there rather than fall
 * back to this list. Passwords here are plain text on purpose — they are
 * throwaway demo credentials, not real ones.
 */
export interface DevUser {
  username: string;
  password: string;
  fullName: string;
  email: string;
  role: Role;
  department?: string;
}

export const DEV_USERS: DevUser[] = [
  {
    username: "admin",
    password: "admin12345",
    fullName: "akmalardhia",
    email: "admin@example.com",
    role: "ADMIN",
    department: "Human Capital",
  },
  {
    username: "budi",
    password: "budi12345",
    fullName: "Budi Santoso",
    email: "budi.santoso@example.com",
    role: "USER",
    department: "Engineering",
  },
];
