import { SendPendingMailButton } from "@/components/lifecycle/SendPendingMailButton";
import { Card } from "@/components/ui/Field";
import type { EmailDelivery, OutboxEvent } from "@/lib/lifecycle/outboxTypes";

/**
 * What happened to the approval emails.
 *
 * The wording is the whole point of this panel. A provider accepting a message
 * means it has taken responsibility for trying — nothing more — so this says
 * "diterima provider" and never "terkirim". Nothing in this system ever learns
 * whether a message reached an inbox, and a screen that implies otherwise is
 * where somebody concludes an approver was told when they were not.
 */

const STATE_LABEL: Record<OutboxEvent["state"], { label: string; className: string }> = {
  PENDING: { label: "Menunggu dikirim", className: "border-warn/30 bg-warn/10 text-warn" },
  SENT: { label: "Diterima provider", className: "border-ok/30 bg-ok/10 text-ok" },
  DEAD: { label: "Gagal dikirim", className: "border-danger/30 bg-danger/10 text-danger" },
};

const KIND_LABEL: Record<OutboxEvent["kind"], string> = {
  "approval.request": "Permintaan persetujuan",
  "approval.result": "Pemberitahuan hasil",
  "request.rejected": "Pemberitahuan penolakan",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export function EmailDeliveryPanel({
  events,
  deliveries,
  canDispatch = false,
}: {
  events: OutboxEvent[];
  deliveries: EmailDelivery[];
  /** Whether the viewer holds `execution.run` and may send what is queued. */
  canDispatch?: boolean;
}) {
  if (events.length === 0) return null;

  // Offered only when there is something to send. A button that runs the
  // dispatcher against an empty queue teaches the operator to ignore it.
  const hasPending = events.some((event) => event.state === "PENDING");

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Email persetujuan</h2>
        {canDispatch && hasPending ? <SendPendingMailButton /> : null}
      </div>

      <ol className="mt-4 space-y-4">
        {events.map((event) => {
          const attempts = deliveries.filter((delivery) => delivery.eventId === event.eventId);
          const state = STATE_LABEL[event.state];

          return (
            <li key={event.eventId} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${state.className}`}
                >
                  {state.label}
                </span>
                <span className="text-xs text-ink-muted">
                  {KIND_LABEL[event.kind]}
                  {event.stage ? ` · ${event.stage === "MANAGER" ? "Manager" : "CISO"}` : ""}
                </span>
              </div>

              <p className="font-mono text-[11px] break-all text-ink-muted">{event.recipient}</p>

              {attempts.map((attempt) => (
                <p key={`${attempt.eventId}-${attempt.attempt}`} className="text-[11px] text-ink-faint">
                  Percobaan {attempt.attempt}:{" "}
                  {attempt.acceptedAt
                    ? `diterima provider ${formatDate(attempt.acceptedAt)}`
                    : `gagal ${attempt.failedAt ? formatDate(attempt.failedAt) : ""} — ${attempt.errorMessage ?? attempt.errorKind}`}
                </p>
              ))}

              {event.state === "PENDING" && event.attempt > 0 ? (
                <p className="text-[11px] text-warn">
                  Dicoba lagi setelah {formatDate(event.nextAttemptAt)}.
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-ink-faint">
        &ldquo;Diterima provider&rdquo; berarti pesan sudah diantrekan untuk dikirim — bukan bukti
        sudah masuk kotak masuk. Tidak ada yang di sistem ini mengetahui hal itu.
      </p>
    </Card>
  );
}
