import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { EmailError, type EmailAcceptance, type EmailDriver, type EmailMessage } from "./types";

/**
 * Writes messages to disk instead of sending them.
 *
 * The demo needs the approval emails to be inspectable — you have to be able to
 * open one and click the link — without a Microsoft tenant standing behind it.
 * Each message becomes a file, and the accompanying HTML can be opened in a
 * browser.
 *
 * It reports `accepted`, like a real provider would, and it is honest about
 * what that means: a file on disk is exactly as "delivered" as a 202 from
 * Graph, which is to say not at all.
 *
 * A fault mode exists for the same reason the AD mock has one — the retry,
 * backoff and dead-letter paths are the parts worth rehearsing, and they are
 * unreachable if sending always works.
 */

export type MailFaultMode =
  | { kind: "none" }
  | { kind: "transient"; count: number }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "recipient-rejected" };

function outboxDir(): string {
  const configured = process.env.EMAIL_FILE_DIR?.trim() || "data/outbox-mail";
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

/** A filename that sorts chronologically and cannot collide. */
function fileNameFor(message: EmailMessage, at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  const who = message.to.address.replace(/[^a-z0-9._-]/gi, "_");
  return `${stamp}__${who}__${randomUUID().slice(0, 8)}`;
}

export class FileEmailDriver implements EmailDriver {
  readonly name = "file";
  readonly simulated = true;

  private remainingTransient: number;

  constructor(private fault: MailFaultMode = { kind: "none" }) {
    this.remainingTransient = fault.kind === "transient" ? fault.count : 0;
  }

  setFault(fault: MailFaultMode): void {
    this.fault = fault;
    this.remainingTransient = fault.kind === "transient" ? fault.count : 0;
  }

  private failIfFaulty(): void {
    if (this.fault.kind === "recipient-rejected") {
      throw new EmailError("RECIPIENT_REJECTED", "Alamat penerima ditolak provider.");
    }
    if (this.fault.kind === "rate-limited") {
      throw new EmailError(
        "RATE_LIMITED",
        "Provider membatasi laju pengiriman.",
        this.fault.retryAfterSeconds,
      );
    }
    if (this.fault.kind === "transient" && this.remainingTransient > 0) {
      this.remainingTransient -= 1;
      throw new EmailError("TRANSIENT", "Gangguan sementara saat menghubungi provider.");
    }
  }

  async send(message: EmailMessage): Promise<EmailAcceptance> {
    this.failIfFaulty();

    const at = new Date();
    const dir = outboxDir();
    await mkdir(dir, { recursive: true });

    const base = fileNameFor(message, at);
    const providerRef = `file:${base}`;

    // The HTML separately, so it can be opened in a browser as the recipient
    // would see it. The card is recorded beside it rather than rendered: no
    // file viewer speaks Adaptive Cards, and pretending otherwise would make
    // the demo look like it proves something about Outlook that it does not.
    await writeFile(path.join(dir, `${base}.html`), message.html, "utf8");
    await writeFile(
      path.join(dir, `${base}.json`),
      `${JSON.stringify(
        {
          to: message.to,
          subject: message.subject,
          acceptedAt: at.toISOString(),
          providerRef,
          card: message.card ?? null,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    return { accepted: true, providerRef, acceptedAt: at.toISOString() };
  }
}

export interface WrittenMessage {
  providerRef: string;
  to: string;
  subject: string;
  acceptedAt: string;
}

/** What has been written so far, newest first. For the demo's outbox screen. */
export async function readWrittenMessages(): Promise<WrittenMessage[]> {
  const dir = outboxDir();
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const messages: WrittenMessage[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json"))) {
    try {
      const raw = await readFile(path.join(dir, entry), "utf8");
      const parsed = JSON.parse(raw) as {
        to: { address: string };
        subject: string;
        acceptedAt: string;
        providerRef: string;
      };
      messages.push({
        providerRef: parsed.providerRef,
        to: parsed.to.address,
        subject: parsed.subject,
        acceptedAt: parsed.acceptedAt,
      });
    } catch {
      // A half-written or hand-edited file is skipped rather than failing the
      // whole listing.
    }
  }

  return messages.sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
}
