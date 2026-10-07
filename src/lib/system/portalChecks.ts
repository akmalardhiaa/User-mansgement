import type { AdDiagnosticCheck } from "@/lib/ad/diagnostics";
import { isDemoLoginEnabled, isLdapConfigured } from "@/lib/auth/ad";
import { isLoginMfaEnabled, listEnrollments } from "@/lib/auth/mfa";
import { resolveRecheckMinutes } from "@/lib/auth/sessionRecheck";
import { missingGmailConfig } from "@/lib/email/gmailDriver";
import { missingGraphConfig } from "@/lib/email/graphDriver";
import { redirectTarget } from "@/lib/email/redirect";
import { SmtpEmailDriver, missingSmtpConfig, smtpConfig, smtpConfigProblem } from "@/lib/email/smtpDriver";
import { resolvePollSeconds } from "@/lib/lifecycle/scheduler";

/**
 * Email and sign-in, checked the way the AD page checks the directory.
 *
 * The SMTP check opens a real connection and logs in — without sending — so a
 * wrong password or a relay that refuses this host shows up here, on the day
 * the portal is set up, and not as an approval email that silently never
 * arrived.
 */

type Env = Record<string, string | undefined>;

export async function runPortalChecks({
  env = process.env,
  verifySmtp = () => new SmtpEmailDriver(smtpConfig()!).verify(),
}: {
  env?: Env;
  verifySmtp?: () => Promise<void>;
} = {}): Promise<AdDiagnosticCheck[]> {
  const production = env.NODE_ENV === "production";
  const checks: AdDiagnosticCheck[] = [await emailCheck(env, production, verifySmtp)];

  let poll: number | undefined;
  try {
    poll = resolvePollSeconds(env.OUTBOX_POLL_SECONDS, production);
    checks.push(
      poll === undefined
        ? { id: "outbox", status: "warn", message: "Pengiriman otomatis mati (OUTBOX_POLL_SECONDS kosong/0): email hanya terkirim bila dikirim manual." }
        : { id: "outbox", status: "ok", message: `Email dikirim saat itu juga; antrean diperiksa ulang tiap ${poll} detik untuk yang gagal.` },
    );
  } catch (error) {
    checks.push({ id: "outbox", status: "fail", message: error instanceof Error ? error.message : String(error) });
  }

  if (isLoginMfaEnabled(env)) {
    const enrolled = await listEnrollments().catch(() => undefined);
    checks.push({
      id: "login-2fa",
      status: "ok",
      message:
        enrolled === undefined
          ? "Aktif: setiap login HC wajib kode dari aplikasi authenticator."
          : `Aktif: setiap login HC wajib kode dari aplikasi authenticator. ${enrolled.length} orang sudah mendaftarkan HP.`,
    });
  } else {
    checks.push({
      id: "login-2fa",
      status: "warn",
      message: "Dimatikan (LOGIN_2FA=off): login cukup dengan kata sandi AD. HP yang sudah terdaftar tetap tersimpan.",
    });
  }

  const demo = isDemoLoginEnabled(env);
  checks.push(
    !demo
      ? { id: "demo-login", status: "ok", message: "Akun demo (admin/admin12345) mati." }
      : isLdapConfigured()
        ? { id: "demo-login", status: "warn", message: "DEMO_LOGIN=on tetapi tidak dipakai karena AD tersambung. Hapus baris itu." }
        : { id: "demo-login", status: "warn", message: "Akun demo aktif (DEMO_LOGIN=on): hanya untuk laptop, jangan untuk kantor." },
  );

  try {
    const minutes = resolveRecheckMinutes(env.SESSION_RECHECK_MINUTES);
    checks.push(
      !isLdapConfigured()
        ? { id: "session-recheck", status: "skip", message: "Tidak berlaku tanpa AD." }
        : minutes === undefined
          ? { id: "session-recheck", status: "warn", message: "Dimatikan: akun yang dinonaktifkan di AD tetap bisa memakai portal sampai sesinya habis." }
          : { id: "session-recheck", status: "ok", message: `Sesi dicocokkan dengan AD tiap ${minutes} menit: akun nonaktif atau keluar dari group HC otomatis keluar dari portal.` },
    );
  } catch (error) {
    checks.push({ id: "session-recheck", status: "fail", message: error instanceof Error ? error.message : String(error) });
  }

  const base = env.APP_BASE_URL?.trim() ?? "";
  checks.push(
    !production
      ? { id: "https", status: "skip", message: "Mode pengembangan: HTTPS tidak diwajibkan." }
      : base.startsWith("https://")
        ? { id: "https", status: "ok", message: `Portal dan link persetujuan memakai ${base}.` }
        : {
            id: "https",
            status: "fail",
            message: `APP_BASE_URL="${base}" bukan https: cookie sesi aman tidak akan terkirim lewat jaringan, dan link persetujuan di email tidak terenkripsi.`,
          },
  );

  return checks;
}

async function emailCheck(env: Env, production: boolean, verifySmtp: () => Promise<void>): Promise<AdDiagnosticCheck> {
  const driver = env.EMAIL_DRIVER?.trim().toLowerCase() ?? "";
  const redirect = redirectTarget();
  const redirected = redirect ? ` Semua email DIALIHKAN ke ${redirect} (EMAIL_REDIRECT_TO) — kosongkan sebelum dipakai sungguhan.` : "";

  switch (driver) {
    case "":
      return { id: "email", status: production ? "fail" : "warn", message: "EMAIL_DRIVER belum diisi: tidak ada email yang dikirim." };
    case "file":
      return {
        id: "email",
        status: production ? "fail" : "warn",
        message: "EMAIL_DRIVER=file: email hanya ditulis ke folder data/outbox-mail, tidak ada yang terkirim.",
      };
    case "graph": {
      const missing = missingGraphConfig();
      return missing.length
        ? { id: "email", status: "fail", message: `Microsoft Graph belum lengkap: ${missing.join(", ")}.` }
        : { id: "email", status: redirect ? "warn" : "ok", message: `Microsoft Graph lengkap; koneksinya tidak diuji dari halaman ini.${redirected}` };
    }
    case "gmail": {
      const missing = missingGmailConfig();
      return missing.length
        ? { id: "email", status: "fail", message: `Gmail API belum lengkap: ${missing.join(", ")}.` }
        : { id: "email", status: redirect ? "warn" : "ok", message: `Gmail API lengkap; koneksinya tidak diuji dari halaman ini.${redirected}` };
    }
    case "smtp": {
      const problem = smtpConfigProblem();
      if (problem) return { id: "email", status: "fail", message: problem };
      const missing = missingSmtpConfig();
      if (missing.length) return { id: "email", status: "fail", message: `SMTP belum lengkap: ${missing.join(", ")}.` };
      const config = smtpConfig()!;
      const where = `${config.host}:${config.port}`;
      try {
        await verifySmtp();
      } catch (error) {
        return {
          id: "email",
          status: "fail",
          message: `SMTP ${where} gagal: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      const login = config.auth ? `login sebagai ${config.auth.user} berhasil` : "tanpa login (relay)";
      const tls = config.tls === "off" ? " TANPA enkripsi (SMTP_TLS=off)." : " dengan TLS.";
      return {
        id: "email",
        status: config.tls === "off" || redirect ? "warn" : "ok",
        message: `SMTP ${where} terhubung, ${login}, pengirim ${config.sender},${tls}${redirected}`,
      };
    }
    default:
      return { id: "email", status: "fail", message: `EMAIL_DRIVER="${driver}" tidak dikenal. Pilihan: smtp, graph, gmail, file.` };
  }
}
