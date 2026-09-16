import type { PortalRole } from "./roles";

/**
 * Local fallback accounts, used ONLY when no LDAP server is configured.
 *
 * The app is meant to authenticate against Active Directory (see ad.ts). Until
 * an `LDAP_URL` is set, these let the portal be opened and demoed locally.
 * They never work in production: authenticateAD throws there rather than fall
 * back to this list. Passwords here are plain text on purpose — they are
 * throwaway demo credentials, not real ones.
 *
 * Between them these cover the cases worth being able to try by hand.
 *
 * Two of them exist to make the approval chain reachable at all: `dimas` and
 * `sarah` carry the addresses that the seeded directory actually records as
 * people's managers, so a request routed to "the manager of this employee"
 * lands on an account somebody can sign into. Without that the demo can raise
 * requests and never approve one, because routing resolves a real address and
 * no login answers to it.
 *
 * `budi` deliberately holds MANAGER while managing nobody. He is the negative
 * fixture: a role is not authority over a particular request, and he should be
 * refused when he tries to decide one that was addressed to someone else.
 *
 * `rina` has no portal role at all — a perfectly valid employee who should see
 * her own profile and nothing else.
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
    roles: ["MANAGER"],
    department: "Human Capital",
  },
  {
    username: "sarah",
    password: "sarah12345",
    fullName: "Sarah Wijaya",
    email: "sarah.wijaya@example.com",
    roles: ["MANAGER"],
    department: "IT — Engineering",
  },
  {
    // Holds MANAGER but manages nobody: the "right role, wrong request" case.
    username: "budi",
    password: "budi12345",
    fullName: "Budi Santoso",
    email: "budi.santoso@example.com",
    roles: ["MANAGER"],
    department: "Engineering",
  },
  {
    username: "bagus",
    password: "bagus12345",
    fullName: "Bagus Nugroho",
    email: "bagus.nugroho@example.com",
    roles: ["CISO_APPROVER"],
    department: "IT — Security",
  },
  {
    username: "rina",
    password: "rina12345",
    fullName: "Rina Pratiwi",
    email: "rina.pratiwi@example.com",
    // Deliberately empty: signs in, sees her own profile, and nothing else.
    roles: [],
    department: "Finance",
  },
];
