import { randomUUID } from "node:crypto";

import { getAdDriver } from "@/lib/ad";
import { AdError, type AdAccountState, type AdDriver } from "@/lib/ad/types";
import { mutateStore, readStore, type StoreShape } from "@/lib/db/store";
import type { Employee } from "@/lib/types";

import type {
  ExecutionErrorCode,
  ExecutionJob,
  ExecutionStepRecord,
} from "./executionTypes";
import { hashPayload } from "./payload";
import { accountNameFor, buildPlan, type ExecutionPlan, type PlannedStep } from "./plan";
import { assertTransition } from "./stateMachine";
import type { LifecycleRequest } from "./types";

/**
 * The execution worker.
 *
 * This is the part that finally makes an approved change real — and the part
 * the plan is most insistent about, because a directory offers no transaction
 * spanning its operations. A job can die between any two writes, and the only
 * honest way to cope is to assume it will:
 *
 *   - Every step is checkpointed as it completes, so a retry resumes rather
 *     than restarting. Re-running a create would make a second account.
 *   - The job id is derived from the request and its version, so a retry finds
 *     the same job and the same checkpoints.
 *   - COMPLETED requires reading the postconditions back out of the directory.
 *     An operation that returned without error is not evidence that the
 *     directory now says what was asked for.
 *   - The employee record is only updated from verified results. The directory
 *     of record must never be told something the actual directory has not
 *     confirmed.
 *
 * What it deliberately does not do is retry its way through an unclear failure.
 * A timeout after a write may mean the write landed; sending it again blind is
 * how one approved change becomes two applied ones.
 */

const MAX_ATTEMPTS = 3;
const LEASE_MS = 60_000;

export interface ExecutionOutcome {
  requestId: string;
  operationId: string;
  status: "COMPLETED" | "FAILED";
  errorCode?: ExecutionErrorCode;
  errorMessage?: string;
  /** Steps that finished, in order, for the report. */
  completedSteps: string[];
}

export interface RunReport {
  ran: number;
  completed: number;
  failed: number;
  /** Jobs an earlier worker abandoned, failed for a human to reconcile. */
  reclaimed: number;
  outcomes: ExecutionOutcome[];
}

function now(): string {
  return new Date().toISOString();
}

function operationIdFor(request: LifecycleRequest): string {
  return `${request.id}:${request.version}`;
}

function audit(
  draft: StoreShape,
  event: {
    actorId: string;
    actorName: string;
    action: string;
    target: string;
    correlationId: string;
    detail?: Record<string, string | number | boolean>;
  },
): void {
  draft.auditEvents.push({
    id: `evt_${randomUUID()}`,
    at: now(),
    source: "WORKER",
    ...event,
  });
}

/** Maps a directory error onto the code an operator sees. */
function classify(error: unknown): { code: ExecutionErrorCode; message: string; retryable: boolean } {
  if (error instanceof AdError) {
    const map: Record<string, ExecutionErrorCode> = {
      PERMISSION: "AD_PERMISSION",
      CONFLICT: "AD_CONFLICT",
      NOT_FOUND: "AD_NOT_FOUND",
      TIMEOUT_AFTER_WRITE: "AD_TIMEOUT_AFTER_WRITE",
      TRANSIENT: "AD_UNAVAILABLE",
      UNKNOWN: "UNKNOWN",
    };
    return { code: map[error.kind] ?? "UNKNOWN", message: error.message, retryable: error.retryable };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Claiming                                                                   */
/* -------------------------------------------------------------------------- */

interface Claim {
  request: LifecycleRequest;
  job: ExecutionJob;
  employee?: Employee;
}

/**
 * Takes one job, atomically.
 *
 * The status change and the lease are written in the same transaction as the
 * claim, so two workers cannot both believe they hold it. A job whose lease has
 * expired is reclaimable — but note what that does NOT mean: the previous
 * worker may still be running. Reclaiming is safe here only because every step
 * is checkpointed and re-reads before it writes.
 */
async function claimNext(workerId: string, at: Date): Promise<Claim | undefined> {
  return mutateStore((draft) => {
    const due = draft.lifecycleRequests.find((request) => {
      if (request.status === "QUEUED") return true;
      if (request.status !== "SCHEDULED") return false;
      return request.effectiveAt ? Date.parse(request.effectiveAt) <= at.getTime() : true;
    });
    if (!due) return undefined;

    if (due.status === "SCHEDULED") {
      assertTransition(due.status, "QUEUED");
      due.status = "QUEUED";
    }
    assertTransition(due.status, "EXECUTING");
    due.status = "EXECUTING";
    due.updatedAt = now();

    const operationId = operationIdFor(due);
    let job = draft.executionJobs.find((candidate) => candidate.operationId === operationId);

    if (!job) {
      job = {
        operationId,
        requestId: due.id,
        version: due.version,
        payloadHash: due.payloadHash,
        state: "CLAIMED",
        attempt: 0,
        steps: [],
        createdAt: now(),
        updatedAt: now(),
      };
      draft.executionJobs.push(job);
    }

    job.attempt += 1;
    job.state = "RUNNING";
    job.leaseWorkerId = workerId;
    job.leaseExpiresAt = new Date(at.getTime() + LEASE_MS).toISOString();
    job.updatedAt = now();

    audit(draft, {
      actorId: workerId,
      actorName: "AD Worker",
      action: "execution.claimed",
      target: due.id,
      correlationId: due.id,
      detail: { operationId, attempt: job.attempt },
    });

    return {
      request: structuredClone(due),
      job: structuredClone(job),
      employee: due.employeeId
        ? structuredClone(draft.employees.find((e) => e.id === due.employeeId))
        : undefined,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Preconditions                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Has anything moved since this was approved?
 *
 * Compared against the snapshot taken at submit. A mismatch is not a directory
 * failure and must not be retried: the approval was given for a situation that
 * no longer holds, and the right outcome is a human deciding whether it still
 * applies.
 */
function detectDrift(request: LifecycleRequest, employee: Employee | undefined): string | undefined {
  if (!request.beforeSnapshot) return undefined;
  if (!employee) return "Catatan karyawan tidak ditemukan lagi.";

  const current: Record<string, string> = {
    displayName: employee.displayName,
    email: employee.email,
    department: employee.department,
    jobTitle: employee.jobTitle,
    managerEmail: employee.managerEmail,
    status: employee.status,
  };

  for (const [field, expected] of Object.entries(request.beforeSnapshot)) {
    if (current[field] !== undefined && current[field] !== expected) {
      return `${field} berubah sejak pengajuan disetujui: "${expected}" menjadi "${current[field]}".`;
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

async function applyStep(
  driver: AdDriver,
  step: PlannedStep,
  context: { guid?: string; request: LifecycleRequest },
): Promise<{ guid?: string }> {
  const groups = (step.params.groups as string[] | undefined) ?? [];

  switch (step.key) {
    case "create-account": {
      const payload = context.request.payload;
      if (payload.kind !== "ONBOARDING") throw new Error("create-account bukan untuk jenis ini.");
      const created = await driver.createAccount({
        sAMAccountName: accountNameFor(payload.email),
        userPrincipalName: payload.email,
        displayName: payload.displayName,
        mail: payload.email,
        department: payload.department,
        title: payload.jobTitle,
        manager: accountNameFor(payload.managerEmail),
        ou: String(step.params.ou),
      });
      return { guid: created.objectGUID };
    }
    case "set-attributes":
      await driver.setAttributes(context.guid!, {
        department: step.params.department as string | undefined,
        title: step.params.title as string | undefined,
        manager: step.params.manager as string | undefined,
      });
      return {};
    case "grant-groups":
      if (groups.length > 0) await driver.addGroups(context.guid!, groups);
      return {};
    case "revoke-groups":
      if (groups.length > 0) await driver.removeGroups(context.guid!, groups);
      return {};
    case "move-ou":
      await driver.moveToOu(context.guid!, String(step.params.ou));
      return {};
    case "enable-account":
      await driver.enableAccount(context.guid!);
      return {};
    case "disable-account":
      await driver.disableAccount(context.guid!);
      return {};
    case "verify":
      // Nothing is written; verification happens against the postconditions
      // once every step has run.
      return {};
  }
}

/** Whether the directory now says what the plan intended. */
function verify(plan: ExecutionPlan, state: AdAccountState | undefined): string | undefined {
  if (!state) return "Objek tidak ditemukan saat pembacaan ulang.";

  const post = plan.postconditions;
  if (state.enabled !== post.enabled) {
    return `enabled seharusnya ${post.enabled}, terbaca ${state.enabled}.`;
  }
  if (state.ou !== post.ou) return `OU seharusnya ${post.ou}, terbaca ${state.ou}.`;

  for (const group of post.requiredGroups) {
    if (!state.groups.includes(group)) return `Group wajib belum ada: ${group}.`;
  }
  for (const group of post.forbiddenGroups) {
    if (state.groups.includes(group)) return `Group seharusnya dicabut masih ada: ${group}.`;
  }
  if (post.attributes.department && state.department !== post.attributes.department) {
    return `department seharusnya ${post.attributes.department}, terbaca ${state.department}.`;
  }
  if (post.attributes.title && state.title !== post.attributes.title) {
    return `title seharusnya ${post.attributes.title}, terbaca ${state.title}.`;
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Finishing                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Writes the verified result back, in one transaction.
 *
 * The employee record changes ONLY here, and only from a state that has been
 * read out of the directory. That is the whole discipline: the roster is
 * allowed to say an account is disabled because the directory was asked and
 * said so, never because an operation returned without throwing.
 */
async function finishSucceeded(
  claim: Claim,
  observed: AdAccountState,
  steps: ExecutionStepRecord[],
  workerId: string,
): Promise<void> {
  await mutateStore((draft) => {
    const request = draft.lifecycleRequests.find((candidate) => candidate.id === claim.request.id);
    const job = draft.executionJobs.find((c) => c.operationId === claim.job.operationId);
    if (!request || !job) return;

    if (job.leaseWorkerId !== workerId) return; // A stale lease reports nothing.

    assertTransition(request.status, "COMPLETED");
    request.status = "COMPLETED";
    request.closedAt = now();
    request.updatedAt = request.closedAt;

    job.state = "SUCCEEDED";
    job.steps = steps;
    job.targetGuid = observed.objectGUID;
    job.finishedAt = now();
    job.updatedAt = job.finishedAt;

    const payload = claim.request.payload;
    const at = now();

    if (payload.kind === "ONBOARDING") {
      draft.employees.push({
        id: `emp_${randomUUID()}`,
        firstName: payload.firstName,
        lastName: payload.lastName,
        displayName: payload.displayName,
        email: payload.email,
        jobTitle: payload.jobTitle,
        jobDescription: payload.jobDescription,
        department: payload.department,
        employmentType: payload.employmentType,
        expiredDate: payload.expiredDate,
        locationType: payload.locationType,
        branchName: payload.branchName,
        managerName: payload.managerName,
        managerEmail: payload.managerEmail,
        // Active because the directory was read back and says so.
        status: observed.enabled ? "ACTIVE" : "DISABLED",
        objectGUID: observed.objectGUID,
        createdAt: at,
        updatedAt: at,
      });
      request.employeeId = draft.employees[draft.employees.length - 1].id;
    } else {
      const employee = draft.employees.find((e) => e.id === claim.request.employeeId);
      if (employee) {
        if (payload.kind === "MOVEMENT") {
          employee.department = payload.toDepartment;
          employee.jobTitle = payload.toJobTitle;
          employee.jobDescription = payload.toJobDescription;
          employee.managerName = payload.toManagerName;
          employee.managerEmail = payload.toManagerEmail;
        }
        employee.status = observed.enabled ? "ACTIVE" : "DISABLED";
        employee.objectGUID = observed.objectGUID;
        employee.updatedAt = at;
      }
    }

    audit(draft, {
      actorId: workerId,
      actorName: "AD Worker",
      action: "execution.completed",
      target: request.id,
      correlationId: request.id,
      detail: { operationId: job.operationId, objectGUID: observed.objectGUID },
    });
  });
}

async function finishFailed(
  claim: Claim,
  steps: ExecutionStepRecord[],
  failure: { code: ExecutionErrorCode; message: string },
  workerId: string,
  guid?: string,
): Promise<void> {
  await mutateStore((draft) => {
    const request = draft.lifecycleRequests.find((candidate) => candidate.id === claim.request.id);
    const job = draft.executionJobs.find((c) => c.operationId === claim.job.operationId);
    if (!request || !job) return;
    if (job.leaseWorkerId !== workerId) return;

    assertTransition(request.status, "FAILED");
    request.status = "FAILED";
    request.updatedAt = now();

    job.state = "FAILED";
    job.steps = steps;
    /*
     * The target is checkpointed on the way out, not only on success.
     *
     * An onboarding that created the object and then failed on groups has
     * already made something real in the directory. Losing its identity here
     * would leave the retry with a completed create-account step and no idea
     * what it created — so it would either strand the object or make a second
     * one. This is the line that makes resuming possible.
     */
    if (guid) job.targetGuid = guid;
    job.errorCode = failure.code;
    job.errorMessage = failure.message;
    job.finishedAt = now();
    job.updatedAt = job.finishedAt;

    audit(draft, {
      actorId: workerId,
      actorName: "AD Worker",
      action: "execution.failed",
      target: request.id,
      correlationId: request.id,
      detail: { operationId: job.operationId, errorCode: failure.code, attempt: job.attempt },
    });
  });
}

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

async function runOne(claim: Claim, driver: AdDriver, workerId: string): Promise<ExecutionOutcome> {
  const { request, job } = claim;
  const base: ExecutionOutcome = {
    requestId: request.id,
    operationId: job.operationId,
    status: "FAILED",
    completedSteps: [],
  };

  /*
   * `guid` is a parameter rather than something this closure reads from the
   * enclosing scope: the first two calls below happen before `let guid` is
   * reached, and capturing it would make them a temporal-dead-zone error
   * instead of the failure they are meant to report.
   */
  const fail = async (
    code: ExecutionErrorCode,
    message: string,
    steps: ExecutionStepRecord[],
    guid?: string,
  ) => {
    await finishFailed(claim, steps, { code, message }, workerId, guid);
    return {
      ...base,
      errorCode: code,
      errorMessage: message,
      completedSteps: steps.filter((s) => s.state === "DONE").map((s) => s.stepKey),
    };
  };

  // The payload must still hash to what was approved. Belt and braces: it is
  // immutable after submit, so this can only fire if something wrote around the
  // rules — in which case executing it is the last thing to do.
  if (hashPayload(request.payload) !== job.payloadHash) {
    return fail("PAYLOAD_MISMATCH", "Isi pengajuan tidak cocok dengan yang disetujui.", []);
  }

  const drift = detectDrift(request, claim.employee);
  if (drift) return fail("DRIFT", drift, []);

  // Steps already done in an earlier attempt are not repeated.
  const done = new Set(job.steps.filter((step) => step.state === "DONE").map((step) => step.stepKey));
  const steps: ExecutionStepRecord[] = job.steps.filter((step) => step.state === "DONE");

  let guid = job.targetGuid ?? claim.employee?.objectGUID;
  const needsExistingObject = request.payload.kind !== "ONBOARDING";

  /*
   * Everything except an onboarding acts on an object that must already exist,
   * so the target is resolved BEFORE any step runs.
   *
   * Without this the first step called the driver with an undefined target and
   * let it fail there — which classified correctly and wrote nothing, but
   * reported "Objek undefined tidak ditemukan" to an operator who then has to
   * work out that the real problem is an employee record never linked to a
   * directory object. Failing here says that outright.
   */
  if (needsExistingObject && !guid && claim.employee) {
    // An account may exist that this record has simply never been linked to —
    // adopt it rather than declaring the person absent from a directory they
    // are plainly in.
    try {
      const adopted = await driver.findByAccountName(accountNameFor(claim.employee.email));
      if (adopted) guid = adopted.objectGUID;
    } catch (error) {
      // A read that throws must fail THIS job, not the whole run. Letting it
      // escape leaves the request stranded in EXECUTING, which nothing reclaims.
      const { code, message } = classify(error);
      return fail(code, message, steps);
    }
  }

  if (needsExistingObject && !guid) {
    return fail(
      "AD_NOT_FOUND",
      `${claim.employee?.displayName ?? "Karyawan"} belum tertaut ke objek direktori mana pun, sehingga tidak ada yang bisa diubah.`,
      steps,
    );
  }

  let before: AdAccountState | undefined;
  try {
    before = guid ? await driver.findByGuid(guid) : undefined;
  } catch (error) {
    const { code, message } = classify(error);
    return fail(code, message, steps, guid);
  }

  if (needsExistingObject && !before) {
    return fail(
      "AD_NOT_FOUND",
      `Objek direktori ${guid} tidak ditemukan. Akun mungkin sudah dihapus atau dipindahkan di luar aplikasi ini.`,
      steps,
      guid,
    );
  }

  const plan = buildPlan(request.payload, before ? { groups: before.groups } : undefined);

  for (const step of plan.steps) {
    if (done.has(step.key)) continue;

    try {
      const result = await applyStep(driver, step, { guid, request });
      if (result.guid) guid = result.guid;
      steps.push({ stepKey: step.key, state: "DONE", at: now() });
    } catch (error) {
      const { code, message, retryable } = classify(error);
      steps.push({
        stepKey: step.key,
        state: "FAILED",
        errorCode: code,
        errorMessage: message,
        at: now(),
      });

      /*
       * A retryable fault is left FAILED with its checkpoints intact rather than
       * looped over here. The next run resumes from the last completed step —
       * which is also what makes the retry safe, since it re-reads before it
       * writes. Looping in place would hold the lease through an outage.
       */
      if (retryable && job.attempt < MAX_ATTEMPTS) {
        return fail(code, `${message} (percobaan ${job.attempt}/${MAX_ATTEMPTS})`, steps, guid);
      }
      return fail(code, message, steps, guid);
    }
  }

  if (!guid) return fail("UNKNOWN", "Objek direktori tidak teridentifikasi.", steps);

  // Read back. An operation that returned without error is not evidence.
  let observed: AdAccountState | undefined;
  try {
    observed = await driver.findByGuid(guid);
  } catch (error) {
    /*
     * The most dangerous of the three reads to let escape: every write has
     * already happened by now. Stranding the request in EXECUTING here would
     * mean the directory was changed and nothing records it.
     */
    const { code, message } = classify(error);
    return fail(code, `Gagal membaca ulang hasil: ${message}`, steps, guid);
  }

  const mismatch = verify(plan, observed);
  if (mismatch || !observed) {
    return fail("VERIFY_FAILED", mismatch ?? "Objek tidak ditemukan.", steps, guid);
  }

  const verified = steps.map((step) =>
    step.stepKey === "verify" ? { ...step, observedAfter: JSON.stringify(observed) } : step,
  );
  await finishSucceeded(claim, observed, verified, workerId);

  return {
    ...base,
    status: "COMPLETED",
    completedSteps: verified.map((step) => step.stepKey),
  };
}

/**
 * Rescues jobs whose worker stopped without reporting.
 *
 * `EXECUTING` can only be left by the worker holding the lease. If that process
 * dies — crash, deploy, killed container — the request sits there forever:
 * nothing claims it, because claiming only looks at QUEUED and SCHEDULED. The
 * lease was being written and never read, which made it decoration.
 *
 * What this deliberately does NOT do is hand the job to a replacement that
 * starts writing. The plan is explicit: a worker whose lease expired may still
 * be running, and the directory may be part-way changed by a process nobody can
 * ask. So the request is failed with a distinct code and a human reconciles it
 * against the checkpoints before any retry.
 */
async function reclaimExpiredLeases(at: Date): Promise<number> {
  return mutateStore((draft) => {
    let reclaimed = 0;

    for (const request of draft.lifecycleRequests) {
      if (request.status !== "EXECUTING") continue;

      const job = draft.executionJobs.find(
        (candidate) => candidate.operationId === operationIdFor(request),
      );
      // No lease at all is treated as expired: it means nobody is holding it.
      if (job?.leaseExpiresAt && Date.parse(job.leaseExpiresAt) > at.getTime()) continue;

      assertTransition(request.status, "FAILED");
      request.status = "FAILED";
      request.updatedAt = at.toISOString();

      if (job) {
        job.state = "FAILED";
        job.errorCode = "LEASE_EXPIRED";
        job.errorMessage =
          "Worker berhenti tanpa melaporkan hasil. Bandingkan objek direktori dengan checkpoint sebelum mencoba lagi.";
        job.updatedAt = at.toISOString();
        job.finishedAt = at.toISOString();
      }

      audit(draft, {
        actorId: "system",
        actorName: "HC Portal",
        action: "execution.lease_expired",
        target: request.id,
        correlationId: request.id,
        detail: { operationId: job?.operationId ?? "-", attempt: job?.attempt ?? 0 },
      });

      reclaimed += 1;
    }

    return reclaimed;
  });
}

/**
 * Executes everything that is due.
 *
 * In-process and triggered deliberately, which is the honest shape for a demo:
 * the plan's production topology is a separate worker inside the corporate
 * network claiming jobs over an authenticated API. What is rehearsed here is
 * the part that carries the risk — ordering, checkpointing, verification and
 * failure classification — not the transport.
 */
export async function runDueJobs(options: { now?: Date; workerId?: string } = {}): Promise<RunReport> {
  const at = options.now ?? new Date();
  const workerId = options.workerId ?? `worker-${process.pid}`;
  const driver = getAdDriver();

  // Before taking anything new, deal with what an earlier run abandoned.
  const reclaimed = await reclaimExpiredLeases(at);

  const outcomes: ExecutionOutcome[] = [];

  // Bounded rather than "while there is work": a run that never returns cannot
  // report, and an unbounded loop over a failing directory is a hot loop.
  for (let i = 0; i < 25; i += 1) {
    const claim = await claimNext(workerId, at);
    if (!claim) break;
    outcomes.push(await runOne(claim, driver, workerId));
  }

  return {
    ran: outcomes.length,
    completed: outcomes.filter((outcome) => outcome.status === "COMPLETED").length,
    failed: outcomes.filter((outcome) => outcome.status === "FAILED").length,
    reclaimed,
    outcomes,
  };
}

/** The jobs behind a request, newest attempt first. For the detail screen. */
export async function jobsForRequest(requestId: string): Promise<ExecutionJob[]> {
  const { executionJobs } = await readStore();
  return executionJobs.filter((job) => job.requestId === requestId);
}
