import { FileEmailDriver, type MailFaultMode } from "./fileDriver";
import { GmailEmailDriver, gmailConfig, missingGmailConfig } from "./gmailDriver";
import { GraphEmailDriver, graphConfig, missingGraphConfig } from "./graphDriver";
import { RedirectingEmailDriver, isValidRedirect, redirectTarget } from "./redirect";
import { SmtpEmailDriver, missingSmtpConfig, smtpConfig } from "./smtpDriver";
import type { EmailDriver } from "./types";

/**
 * Which email provider the dispatcher talks to.
 *
 * Explicit, like the directory driver, and for the same reason: a deployment
 * that has not said how approval emails leave the building is one nobody has
 * decided about. Production refuses the simulated driver outright — approvals
 * silently written to a folder while the dashboard reports them as sent is the
 * failure mode this guards against.
 */

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

let cached: EmailDriver | undefined;

function parseFault(): MailFaultMode {
  const raw = process.env.EMAIL_FAULT?.trim().toLowerCase();
  if (!raw || raw === "none") return { kind: "none" };
  if (raw === "recipient-rejected") return { kind: "recipient-rejected" };

  const transient = /^transient:(\d+)$/.exec(raw);
  if (transient) return { kind: "transient", count: Number.parseInt(transient[1], 10) };

  const limited = /^rate-limited:(\d+)$/.exec(raw);
  if (limited) return { kind: "rate-limited", retryAfterSeconds: Number.parseInt(limited[1], 10) };

  throw new EmailConfigurationError(
    `EMAIL_FAULT="${raw}" tidak dikenal. Pilihan: none, transient:<n>, rate-limited:<detik>, recipient-rejected.`,
  );
}

/**
 * Wraps the chosen driver when every message is to go to one mailbox.
 *
 * Applied to whichever driver was selected rather than inside one of them, so
 * every driver behaves identically and a future one inherits it without knowing
 * the feature exists.
 */
function withRedirect(driver: EmailDriver, production: boolean): EmailDriver {
  const target = redirectTarget();
  if (!target) return driver;

  if (production) {
    throw new EmailConfigurationError(
      "EMAIL_REDIRECT_TO ditolak di production. Approver yang tidak pernah menerima " +
        "permintaan persetujuan adalah kegagalan yang justru dijaga oleh lapisan ini.",
    );
  }

  if (!isValidRedirect(target)) {
    // Silently ignoring it would send to the real addresses — the exact outcome
    // somebody set this variable to prevent.
    throw new EmailConfigurationError(
      `EMAIL_REDIRECT_TO="${target}" bukan alamat email yang sah.`,
    );
  }

  return new RedirectingEmailDriver(driver, target);
}

export function getEmailDriver(): EmailDriver {
  if (cached) return cached;

  const production = process.env.NODE_ENV === "production";
  cached = withRedirect(buildDriver(production), production);
  return cached;
}

function buildDriver(production: boolean): EmailDriver {
  const configured = process.env.EMAIL_DRIVER?.trim().toLowerCase();

  if (configured === "graph") {
    const config = graphConfig();
    if (!config) {
      // Names what is missing rather than saying "not available": the person
      // reading this is configuring a tenant and needs the list.
      throw new EmailConfigurationError(
        `EMAIL_DRIVER=graph tetapi konfigurasi belum lengkap. Belum diisi: ${missingGraphConfig().join(", ")}.`,
      );
    }
    // Never exercised against a real tenant yet — see graphDriver.ts.
    return new GraphEmailDriver(config);
  }

  if (configured === "gmail") {
    const config = gmailConfig();
    if (!config) {
      throw new EmailConfigurationError(
        `EMAIL_DRIVER=gmail tetapi konfigurasi belum lengkap. Belum diisi: ${missingGmailConfig().join(", ")}.`,
      );
    }
    // Never exercised against a real account yet — see gmailDriver.ts.
    return new GmailEmailDriver(config);
  }

  if (configured === "smtp") {
    const config = smtpConfig();
    if (!config) {
      throw new EmailConfigurationError(
        `EMAIL_DRIVER=smtp tetapi konfigurasi belum lengkap. Belum diisi: ${missingSmtpConfig().join(", ")}.`,
      );
    }
    // Never exercised against a real server yet — see smtpDriver.ts.
    return new SmtpEmailDriver(config);
  }

  if (configured === "file") {
    if (production) {
      throw new EmailConfigurationError(
        "EMAIL_DRIVER=file ditolak di production. Email persetujuan tidak boleh berakhir di folder lokal.",
      );
    }
    return new FileEmailDriver(parseFault());
  }

  throw new EmailConfigurationError(
    "EMAIL_DRIVER belum diset. Isi `file` untuk demo, `smtp` untuk SMTP, `gmail` untuk Gmail API, atau `graph` untuk Microsoft Graph.",
  );
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.EMAIL_DRIVER?.trim());
}

/** Drops the cached driver. Tests and fault-mode changes need this. */
export function resetEmailDriver(): void {
  cached = undefined;
}

export type { EmailDriver } from "./types";
