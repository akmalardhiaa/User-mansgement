import type { PortalRole } from "./roles";

/**
 * Local fallback accounts, used ONLY when no LDAP server is configured.
 *
 * The app is meant to authenticate against Active Directory (see ad.ts). Until
 * an `LDAP_URL` or `AD_LDAP_URL` is set, these let the portal be opened and demoed locally.
 * They never work in production: authenticateAD throws there rather than fall
 * back to this list. Passwords here are plain text on purpose — they are
 * throwaway demo credentials, not real ones.
 *
 * Between them these cover the cases worth being able to try by hand.
 *
 * Only `admin` can sign in. The portal is HC's alone: managers and the CISO
 * team approve from their email and have no role here. The others stay on the
 * list as valid directory accounts WITHOUT a portal role, so trying to sign in
 * as one shows exactly what a manager sees in production — a refusal that tells
 * them to use the email instead.
 *
 * `dimas` and `sarah` still matter: they carry the addresses the seeded
 * directory records as people's managers, which is where approval emails for
 * the demo roster are routed.
 */
export interface DevUser {
  username: string;
  password: string;
  fullName: string;
  email: string;
  roles: PortalRole[];
  department?: string;
}

export const DEV_USERS: DevUser[] = [
  {
    username: "admin",
    password: "admin12345",
    fullName: "akmalardhia",
    email: "admin@example.com",
    roles: ["SYSTEM_ADMIN", "HC_REQUESTER"],
    department: "Human Capital",
  },
  {
    // The manager of record for most of the seeded roster.
    username: "dimas",
    password: "dimas12345",
    fullName: "Dimas Anggara",
    email: "dimas.anggara@example.com",
    roles: [],
    department: "Human Capital",
  },
  {
    username: "sarah",
    password: "sarah12345",
    fullName: "Sarah Wijaya",
    email: "sarah.wijaya@example.com",
    roles: [],
    department: "IT — Engineering",
  },
  {
    // A manager of nobody. Once the "right role, wrong request" fixture; there is
    // no approver role any more, so now simply another account that cannot sign in.
    username: "budi",
    password: "budi12345",
    fullName: "Budi Santoso",
    email: "budi.santoso@example.com",
    roles: [],
    department: "Engineering",
  },
  {
    username: "bagus",
    password: "bagus12345",
    fullName: "Bagus Nugroho",
    email: "bagus.nugroho@example.com",
    roles: [],
    department: "IT — Security",
  },
  {
    username: "rina",
    password: "rina12345",
    fullName: "Rina Pratiwi",
    email: "rina.pratiwi@example.com",
    // Deliberately empty: a valid employee with no business in this portal.
    roles: [],
    department: "Finance",
  },
];
