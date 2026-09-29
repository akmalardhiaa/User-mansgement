import { SendPendingMailButton } from "@/components/lifecycle/SendPendingMailButton";
import { Card } from "@/components/ui/Field";
import type { Dictionary } from "@/lib/i18n/dictionaries/id";
import { getTranslations } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";
import type { EmailDelivery, OutboxEvent } from "@/lib/lifecycle/outboxTypes";

/**
 * What happened to the approval emails.
 *
 * The wording is the whole point of this panel. A provider accepting a message
 * means it has taken responsibility for trying — nothing more — so this says
 * "diterima provider" and never "terkirim". Nothing in this system ever learns
 * whether a message reached an inbox, and a screen that implies otherwise is
 * where somebody concludes an approver was told when they were not.
 *
 * A server component, and it has to be one: it renders inside the request
 * detail page, which is server-rendered, and it holds no state and no handler.
 * It briefly called `useT()` — the client hook — which threw at runtime rather
 * than at build, because a hook is only wrong once something renders it. The
 * words come from `getTranslations()` instead, which is the server half of the
 * same dictionary.
 */

const STATE_STYLE: Record<OutboxEvent["state"], string> = {
  PENDING: "border-warn/30 bg-warn/10 text-warn",
  SENT: "border-ok/30 bg-ok/10 text-ok",
  DEAD: "border-danger/30 bg-danger/10 text-danger",
};

function stateLabel(t: Dictionary, state: OutboxEvent["state"]): string {
  if (state === "PENDING") return t.email.queued;
  if (state === "SENT") return t.email.accepted;
  return t.email.failed;
}

function kindLabel(t: Dictionary, kind: OutboxEvent["kind"]): string {
  if (kind === "approval.request") return t.email.approvalRequest;
  if (kind === "approval.result") return t.email.resultNotice;
  return t.email.rejectionNotice;
}

/** Jakarta time in the reader's language. The timezone is the company's, always. */
function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export async function EmailDeliveryPanel({
  events,
  deliveries,
  canDispatch = false,
}: {
  events: OutboxEvent[];
  deliveries: EmailDelivery[];
  /** Whether the viewer holds `execution.run` and may send what is queued. */
  canDispatch?: boolean;
}) {
  const { t, locale } = await getTranslations();
  if (events.length === 0) return null;

  // Offered only when there is something to send. A button that runs the
  // dispatcher against an empty queue teaches the operator to ignore it.
  const hasPending = events.some((event) => event.state === "PENDING");

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{t.email.title}</h2>
        {canDispatch && hasPending ? <SendPendingMailButton /> : null}
      </div>

      <ol className="mt-4 space-y-4">
        {events.map((event) => {
          const attempts = deliveries.filter((delivery) => delivery.eventId === event.eventId);

          return (
            <li key={event.eventId} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    STATE_STYLE[event.state]
                  }`}
                >
                  {stateLabel(t, event.state)}
                </span>
                <span className="text-xs text-ink-muted">
                  {kindLabel(t, event.kind)}
                  {event.stage ? ` · ${event.stage === "MANAGER" ? "Manager" : "CISO"}` : ""}
                </span>
              </div>

              <p className="font-mono text-[11px] break-all text-ink-muted">{event.recipient}</p>

              {attempts.map((attempt) => (
                <p
                  key={`${attempt.eventId}-${attempt.attempt}`}
                  className="text-[11px] text-ink-faint"
                >
                  {t.email.attempt} {attempt.attempt}:{" "}
                  {attempt.acceptedAt
                    ? `${t.email.acceptedAtPrefix} ${formatDate(attempt.acceptedAt, locale)}`
                    : `${t.email.failedAtPrefix} ${
                        attempt.failedAt ? formatDate(attempt.failedAt, locale) : ""
                      } — ${attempt.errorMessage ?? attempt.errorKind}`}
                </p>
              ))}

              {event.state === "PENDING" && event.attempt > 0 ? (
                <p className="text-[11px] text-warn">
                  {t.email.retryAfter.replace("{when}", formatDate(event.nextAttemptAt, locale))}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-ink-faint">
        {t.email.disclaimer}
      </p>
    </Card>
  );
}
