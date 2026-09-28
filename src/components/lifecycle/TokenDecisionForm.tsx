"use client";

import { useEffect, useRef, useState } from "react";

import { useT } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card, TextareaField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import { IconCheck, IconClose } from "@/components/ui/Icons";
import { postJson } from "@/lib/client/accountsApi";

/**
 * Deciding from the link in an email.
 *
 * The token stays in the URL and is posted from here — never rendered into the
 * page, never put in a query string this form submits, never echoed back by the
 * response. The decision is a POST for the same reason the link opens a page
 * instead of deciding: anything that follows URLs in a mailbox must not be able
 * to approve anything.
 */
export function TokenDecisionForm({
  token,
  stage,
  initial,
}: {
  token: string;
  stage: "MANAGER" | "CISO";
  /**
   * Which button the approver pressed in the email.
   *
   * "APPROVED" submits on mount: the decision was made in the inbox, one click,
   * which is what the company asked for. A confirmation step was tried on
   * 21 September 2026 and taken out again at their request.
   *
   * Be clear about what that costs. Anything which opens the link AND runs its
   * scripts approves — a security gateway that detonates links in a sandbox, or
   * a forwarded message someone else opens. With the CISO stage sent to a whole
   * team the exposure is multiplied by the team, and one such approval also
   * kills every other member's link. The endpoint is still POST-only, so merely
   * fetching the URL decides nothing, and the decision is credited to the owner
   * of the link — narrower than a GET that mutates, and not zero.
   *
   * "REJECTED" never auto-submits. A rejection requires a reason, the requester
   * reads it, and there is nothing to submit until somebody writes one.
   */
  initial?: "APPROVED" | "REJECTED";
}) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(initial === "REJECTED");
  const t = useT();
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ decision: string; status: string } | null>(null);

  async function decide(decision: "APPROVED" | "REJECTED") {
    setBusy(decision);
    setError(null);

    const result = await postJson<{ requestId: string; status: string; decision: string }>(
      "/api/approval-actions",
      { token, decision, reason: reason.trim() || undefined },
    );

    if (result.ok) {
      setDone({ decision: result.data.decision, status: result.data.status });
      return;
    }

    setError(result.failure.message);
    setBusy(null);
  }

  /*
   * Fires once. React runs effects twice in development's strict mode, and the
   * token is single-use — a second POST would come back "already decided" and
   * show the approver an error for something that in fact worked.
   */
  const submitted = useRef(false);
  useEffect(() => {
    if (initial !== "APPROVED" || submitted.current) return;
    submitted.current = true;
    void decide("APPROVED");
    // `decide` is stable for the life of this component; re-running on its
    // identity would defeat the guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  if (done) {
    const approved = done.decision === "APPROVED";
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border ${
              approved ? "border-ok/30 bg-ok/10 text-ok" : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {approved ? <IconCheck className="size-4" /> : <IconClose className="size-4" />}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {approved ? t.approval.recordedApproved : t.approval.recordedRejected}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {approved
                ? t.approval.recordedApprovedBody
                : t.approval.recordedRejectedBody}
            </p>
            {approved ? (
              <p className="mt-3 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
                {t.approval.approvalNotExecution}
              </p>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-ink">
        {t.approval.yourDecision.replace("{stage}", stage === "MANAGER" ? "Manager" : "CISO")}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        {stage === "MANAGER"
          ? t.approval.managerScope
          : t.approval.cisoScope}
      </p>

      <div className="mt-4 space-y-4">
        <FormAlert tone="error">{error}</FormAlert>


        {rejecting ? (
          <TextareaField
            label={t.approval.rejectReason}
            name="reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t.approval.rejectReasonPlaceholder}
            hint={t.approval.rejectReasonHint}
          />
        ) : null}

        <div className="flex flex-wrap gap-2.5">
          {rejecting ? (
            <>
              <Button
                variant="danger"
                icon={<IconClose />}
                loading={busy === "REJECTED"}
                disabled={reason.trim().length === 0 || busy !== null}
                onClick={() => decide("REJECTED")}
              >
                {t.approval.sendRejection}
              </Button>
              <Button variant="ghost" disabled={busy !== null} onClick={() => setRejecting(false)}>
                {t.common.cancel}
              </Button>
            </>
          ) : (
            <>
              <Button
                icon={<IconCheck />}
                loading={busy === "APPROVED"}
                disabled={busy !== null}
                onClick={() => decide("APPROVED")}
              >
                {t.approval.approve}
              </Button>
              <Button
                variant="danger"
                icon={<IconClose />}
                disabled={busy !== null}
                onClick={() => setRejecting(true)}
              >
                {t.approval.reject}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
