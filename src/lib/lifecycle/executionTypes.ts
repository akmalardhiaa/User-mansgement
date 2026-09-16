import type { StepKey } from "./plan";

/**
 * The record of an attempt to make an approved change real.
 *
 * Separate from the request on purpose. The request says what was asked for and
 * who agreed to it; this says what was actually done to a directory, when, and
 * what came back. Those are different facts with different lifetimes — a
 * request is decided once, while execution may be attempted several times — and
 * folding them together is how "approved" quietly starts reading as "done".
 */

export type JobState = "CLAIMED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type StepState = "PENDING" | "DONE" | "FAILED";

export interface ExecutionStepRecord {
  stepKey: StepKey;
  state: StepState;
  /** What the directory held before this step ran. */
  before?: string;
  /** What the step meant to make true. */
  intendedAfter?: string;
  /** What was actually read back afterwards. Absent until verified. */
  observedAfter?: string;
  errorCode?: string;
  errorMessage?: string;
  at?: string;
}

export interface ExecutionJob {
  /**
   * Deterministic: `${requestId}:${version}`.
   *
   * This is what makes a retry find the same job and its checkpoints instead of
   * starting a second one. A random id would let two runs of the same approved
   * change each believe they were the first.
   */
  operationId: string;
  requestId: string;
  /** The request version this job executes. A revision produces a new job. */
  version: number;
  /** Fingerprint of the payload as approved, re-checked before any write. */
  payloadHash: string;
  /** The directory object being changed. Absent for an onboarding until created. */
  targetGuid?: string;
  state: JobState;
  attempt: number;
  steps: ExecutionStepRecord[];
  /** Who holds it, and until when. A result from an expired lease is refused. */
  leaseWorkerId?: string;
  leaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  /** Structured reason the job failed, for the operator screen. */
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Why a job stopped, in terms an operator can act on.
 *
 * `DRIFT` is the one worth naming separately: it does not mean anything went
 * wrong with the directory, it means the account no longer looks like it did
 * when the change was approved. Retrying is exactly the wrong response — the
 * approval was given for a situation that no longer holds.
 */
export type ExecutionErrorCode =
  | "DRIFT"
  /**
   * The worker holding this job stopped without reporting.
   *
   * Never retried automatically. The directory may have been part-way changed
   * by a process that is no longer around to say how far it got, so the only
   * safe next move is a human comparing the object against the checkpoints.
   */
  | "LEASE_EXPIRED"
  | "PAYLOAD_MISMATCH"
  | "AD_PERMISSION"
  | "AD_CONFLICT"
  | "AD_NOT_FOUND"
  | "AD_TIMEOUT_AFTER_WRITE"
  | "AD_UNAVAILABLE"
  | "VERIFY_FAILED"
  | "UNKNOWN";
