/**
 * The contract every email driver implements.
 *
 * The single most important thing this interface refuses to express is
 * "delivered". A provider accepting a message means it has taken
 * responsibility for trying — nothing more. Microsoft Graph answers `sendMail`
 * with 202 Accepted, which says the request was queued, not that anything
 * reached an inbox, and a dashboard that reports the second when it only knows
 * the first is lying in the most consequential place it could.
 *
 * So the result type carries `accepted` and a provider reference, and there is
 * no `delivered` field for a caller to reach for.
 */

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailMessage {
  to: EmailAddress;
  subject: string;
  /** The plain HTML body, always present, even when a card is attached. */
  html: string;
  /**
   * The Actionable Message card, when the driver and recipient support one.
   * Absent is normal and never an error: the HTML body has to carry the request
   * on its own, because that is what an unsupported client will show.
   */
  card?: unknown;
}

export interface EmailAcceptance {
  /** The provider took the message. NOT evidence it arrived. */
  accepted: true;
  /** Provider-side identifier, for tracing a message that never turns up. */
  providerRef: string;
  acceptedAt: string;
}

export type EmailErrorKind =
  | "TRANSIENT"
  | "RATE_LIMITED"
  | "PERMISSION"
  | "RECIPIENT_REJECTED"
  | "PAYLOAD"
  | "UNKNOWN";

export class EmailError extends Error {
  constructor(
    readonly kind: EmailErrorKind,
    message: string,
    /** From a 429 `Retry-After`, in seconds, when the provider gave one. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "EmailError";
  }

  /**
   * Whether sending again could plausibly work without anybody intervening.
   *
   * A rejected recipient and a permission problem are not retried: repeating
   * them produces identical failures and buries the one message an operator
   * needed to see.
   */
  get retryable(): boolean {
    return this.kind === "TRANSIENT" || this.kind === "RATE_LIMITED";
  }
}

export interface EmailDriver {
  readonly name: string;
  /** True for a driver that does not reach a real mailbox. */
  readonly simulated: boolean;
  send(message: EmailMessage): Promise<EmailAcceptance>;
}
