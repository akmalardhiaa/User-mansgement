import { postJson, type ApiFailure } from "@/lib/client/accountsApi";
import type { LifecycleRequest } from "@/lib/lifecycle/types";

/**
 * Raising a request is two calls, and the UI does not pretend otherwise.
 *
 * `POST /api/lifecycle-requests` opens a draft; `POST /:id/submit` freezes the
 * payload and routes it. They are separate because the version a decision
 * refers to is locked at submit, so there has to be a moment before that where
 * HC can still change their mind cheaply.
 *
 * What this means for the screen: the approvers are NOT known until the submit
 * comes back. They are resolved server-side from the division catalogue and the
 * security function, so the confirmation panel shows who was actually asked
 * rather than who the browser guessed would be asked.
 */

export type SubmitOutcome =
  | { ok: true; request: LifecycleRequest }
  | { ok: false; failure: ApiFailure };

export async function createAndSubmit(body: Record<string, unknown>): Promise<SubmitOutcome> {
  const draft = await postJson<{ request: LifecycleRequest }>("/api/lifecycle-requests", body);
  if (!draft.ok) return { ok: false, failure: draft.failure };

  const created = draft.data.request;
  const submitted = await postJson<{ request: LifecycleRequest }>(
    `/api/lifecycle-requests/${created.id}/submit`,
    { version: created.version },
  );

  if (!submitted.ok) {
    /*
     * The draft exists but could not be routed — a separation-of-duties clash,
     * or an approver who cannot be resolved. It is left in place rather than
     * quietly deleted: it is a real record of what HC tried to raise, it shows
     * up in the request list as a draft, and HC can revise and resubmit it.
     */
    return { ok: false, failure: submitted.failure };
  }

  return { ok: true, request: submitted.data.request };
}
