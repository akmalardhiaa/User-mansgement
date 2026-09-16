/**
 * The contract every Active Directory driver implements.
 *
 * Two of them will exist: the mock that backs the demo, and a real one that
 * talks to a domain controller from a worker inside the corporate network. The
 * interface is written for the real one — that is the whole point of having it —
 * so the mock cannot quietly offer conveniences the real thing could not.
 *
 * Note what the interface does NOT expose: no free-text command, no script
 * path, no distinguished name supplied by a caller, no password. A driver
 * accepts typed operations against a catalogue-resolved target, because the
 * alternative is an API whose safety depends on every caller being careful.
 */

/** A directory object as it actually stands, read back from the directory. */
export interface AdAccountState {
  /**
   * The stable identity. Email and distinguished name both change over a
   * person's time at a company; this does not, which is why relations are keyed
   * on it rather than on anything human-readable.
   */
  objectGUID: string;
  sAMAccountName: string;
  userPrincipalName: string;
  displayName: string;
  mail: string;
  department: string;
  title: string;
  /** The manager's account name, not their email. */
  manager?: string;
  enabled: boolean;
  /** Organisational unit the object currently sits in. */
  ou: string;
  /** Group memberships this application manages. Sorted, for stable comparison. */
  groups: string[];
}

/** What a new account is created from. */
export interface AdCreateSpec {
  sAMAccountName: string;
  userPrincipalName: string;
  displayName: string;
  mail: string;
  department: string;
  title: string;
  manager?: string;
  ou: string;
}

/** The attributes a movement may change. Absent means "leave alone". */
export interface AdAttributePatch {
  displayName?: string;
  department?: string;
  title?: string;
  manager?: string;
  mail?: string;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Why an operation failed, in the terms the worker has to act on.
 *
 * The distinction that matters most is TRANSIENT versus everything else. A
 * network blip before a write is safe to retry; a permission problem retried
 * fifty times is fifty identical failures and a filled-up log. Anything the
 * driver cannot classify is UNKNOWN and is NOT retried, because guessing
 * "probably transient" is how a half-applied change gets attempted again.
 */
export type AdErrorKind =
  | "TRANSIENT"
  | "PERMISSION"
  | "CONFLICT"
  | "NOT_FOUND"
  | "TIMEOUT_AFTER_WRITE"
  | "UNKNOWN";

export class AdError extends Error {
  constructor(
    readonly kind: AdErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AdError";
  }

  /**
   * Whether retrying could plausibly succeed without anybody intervening.
   *
   * TIMEOUT_AFTER_WRITE is deliberately NOT retryable: the write may well have
   * landed, and the only safe next move is to read the directory back and find
   * out, not to send it again.
   */
  get retryable(): boolean {
    return this.kind === "TRANSIENT";
  }
}

/* -------------------------------------------------------------------------- */
/* Driver                                                                     */
/* -------------------------------------------------------------------------- */

export interface AdDriver {
  /** Which implementation this is, for logs and for the status screen. */
  readonly name: string;
  /** True for a driver that only simulates. Production refuses to run one. */
  readonly simulated: boolean;

  findByAccountName(sAMAccountName: string): Promise<AdAccountState | undefined>;
  findByGuid(objectGUID: string): Promise<AdAccountState | undefined>;

  /**
   * Creates the object DISABLED, always.
   *
   * An account that exists and works before its group memberships have been
   * applied and verified is a window in which somebody holds an account nobody
   * has finished authorising. Enabling is its own step, at the end.
   */
  createAccount(spec: AdCreateSpec): Promise<AdAccountState>;

  setAttributes(objectGUID: string, patch: AdAttributePatch): Promise<void>;
  addGroups(objectGUID: string, groups: readonly string[]): Promise<void>;
  removeGroups(objectGUID: string, groups: readonly string[]): Promise<void>;
  moveToOu(objectGUID: string, ou: string): Promise<void>;
  enableAccount(objectGUID: string): Promise<void>;
  disableAccount(objectGUID: string): Promise<void>;
}
