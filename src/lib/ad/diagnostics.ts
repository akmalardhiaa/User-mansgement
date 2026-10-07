import { X509Certificate } from "node:crypto";

import { DEPARTMENTS } from "@/lib/db/seed";
import {
  configuredDepartmentOus,
  departmentOu,
  departmentOuParent,
} from "@/lib/lifecycle/accessProfiles";
import { directorySyncStatus, type DirectorySyncStatus } from "@/lib/lifecycle/directorySyncScheduler";

import { toAdError } from "./ldapErrors";
import { isManaged } from "./ldapDn";
import { ldapConnector, readLdapAdConfig, readLdapCa, type LdapClientLike, type LdapEnv } from "./ldapConnection";

export type AdCheckStatus = "ok" | "warn" | "fail" | "skip";

export type AdDiagnosticCheckId =
  | "login-url"
  | "role-groups"
  | "driver"
  | "config"
  | "ca"
  | "bind"
  | "base-dn"
  | "managed-ous"
  | "quarantine-ou"
  | "department-ous"
  | "ciso-group"
  | "employee-sync"
  | "write"
  // Not the directory's, but listed on the same page: see lib/system/portalChecks.ts.
  | "email"
  | "outbox"
  | "login-2fa"
  | "demo-login"
  | "session-recheck"
  | "https";

export interface AdDiagnosticCheck {
  id: AdDiagnosticCheckId;
  status: AdCheckStatus;
  message: string;
}

export interface AdDiagnosticReport {
  checkedAt: string;
  driver: string;
  writeEnabled: boolean;
  overall: AdCheckStatus;
  checks: AdDiagnosticCheck[];
}

const STATUS_WEIGHT: Record<AdCheckStatus, number> = { skip: 0, ok: 1, warn: 2, fail: 3 };

function cleanMessage(message: string, password: string): string {
  return password ? message.split(password).join("[REDACTED]") : message;
}

function errorMessage(error: unknown, password: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return cleanMessage(message, password);
}

function hasEntry(client: LdapClientLike, dn: string): Promise<boolean> {
  return client
    .search(dn, { scope: "base", filter: "(objectClass=*)", attributes: ["distinguishedName"] })
    .then((entries) => entries.length > 0);
}

function checkDn(
  checks: AdDiagnosticCheck[],
  client: LdapClientLike,
  id: AdDiagnosticCheckId,
  dn: string,
  password: string,
): Promise<void> {
  return hasEntry(client, dn)
    .then((exists) => {
      checks.push({
        id,
        status: exists ? "ok" : "fail",
        message: exists ? `${dn} ditemukan.` : `${dn} tidak ditemukan.`,
      });
    })
    .catch((error: unknown) => {
      checks.push({ id, status: "fail", message: errorMessage(error, password) });
    });
}

/**
 * Where each division's accounts will be created, checked before anybody is.
 *
 * Every OU a division can resolve to: the explicit pairs, and - when the
 * naming convention is on - the OU named after every division the form
 * offers. All of them must sit inside AD_MANAGED_OUS, or the driver refuses
 * the write; all of them must exist, or the onboarding fails at its first
 * step. A missing explicit OU is a failure, because somebody named it; a
 * missing conventional one is a warning, because the division may simply
 * never be used - but it says which divisions would fail.
 */
async function checkDepartmentOus(
  checks: AdDiagnosticCheck[],
  client: LdapClientLike,
  env: LdapEnv,
  managedOus: readonly string[],
  password: string,
): Promise<void> {
  const id = "department-ous";
  let targets: Array<{ department: string; ou: string; explicit: boolean }>;
  try {
    const pairs = configuredDepartmentOus(env);
    const parent = departmentOuParent(env);
    if (pairs.length === 0 && !parent) {
      checks.push({
        id,
        status: "skip",
        message: "AD_DEPARTMENT_OUS dan AD_DEPARTMENT_OU_PARENT kosong: semua akun baru masuk AD_OU_STANDARD.",
      });
      return;
    }
    const named = new Set(pairs.map((pair) => pair.department.toLowerCase()));
    targets = [
      ...pairs.map((pair) => ({ ...pair, explicit: true })),
      ...(parent
        ? DEPARTMENTS.filter((department) => !named.has(department.toLowerCase())).map((department) => ({
            department,
            ou: departmentOu(department, env)!,
            explicit: false,
          }))
        : []),
    ];
  } catch (error) {
    checks.push({ id, status: "fail", message: errorMessage(error, password) });
    return;
  }

  const outside = targets.filter((target) => !isManaged(target.ou, managedOus));
  if (outside.length > 0) {
    checks.push({
      id,
      status: "fail",
      message: `OU divisi berikut berada di luar AD_MANAGED_OUS: ${outside.map((target) => target.department).join(", ")}.`,
    });
    return;
  }

  const missing: typeof targets = [];
  try {
    for (const target of targets) {
      // A domain controller answers a search based at a DN that does not
      // exist with noSuchObject, not with an empty result.
      const exists = await hasEntry(client, target.ou).catch((error: unknown) => {
        if (toAdError(error, "read", target.ou).kind === "NOT_FOUND") return false;
        throw error;
      });
      if (!exists) missing.push(target);
    }
  } catch (error) {
    checks.push({ id, status: "fail", message: errorMessage(error, password) });
    return;
  }

  const describe = (list: typeof targets) => list.map((target) => `${target.department} (${target.ou})`).join("; ");
  const missingExplicit = missing.filter((target) => target.explicit);
  if (missingExplicit.length > 0) {
    checks.push({ id, status: "fail", message: `OU divisi tidak ditemukan: ${describe(missingExplicit)}.` });
  } else if (missing.length > 0) {
    checks.push({
      id,
      status: "warn",
      message: `Divisi berikut belum punya OU, jadi onboarding-nya akan gagal: ${describe(missing)}.`,
    });
  } else {
    checks.push({ id, status: "ok", message: `${targets.length} OU divisi ditemukan dan berada di AD_MANAGED_OUS.` });
  }
}

const CLOCK = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/**
 * Whether the portal's employee directory is being read from AD, and how the
 * last read went. Reported from this process's memory, not by reading the
 * directory again: the status page must not cost a full sync per visit.
 */
function employeeSyncCheck(status: DirectorySyncStatus, driver: string): AdDiagnosticCheck {
  const id = "employee-sync";
  if (driver !== "ldap") {
    return { id, status: "skip", message: "Sinkronisasi karyawan hanya berjalan dengan AD_DRIVER=ldap." };
  }
  if (!status.enabled) {
    return { id, status: "skip", message: "Sinkronisasi karyawan dimatikan (AD_SYNC_MINUTES=0)." };
  }
  const report = status.lastReport;
  const failure = status.lastError;
  if (failure && (!report || failure.at > report.at)) {
    return {
      id,
      status: "warn",
      message: `Sinkronisasi terakhir gagal (${CLOCK.format(new Date(failure.at))} WIB): ${failure.message}`,
    };
  }
  if (!report) {
    return { id, status: "skip", message: "Belum berjalan; sinkronisasi pertama dimulai beberapa detik setelah portal start." };
  }
  const extra = [
    report.conflicts ? `${report.conflicts} alamat bentrok` : "",
    report.notFound ? `${report.notFound} tidak ditemukan di AD (dibiarkan)` : "",
  ].filter(Boolean);
  return {
    id,
    status: "ok",
    message: `Terakhir ${CLOCK.format(new Date(report.at))} WIB, tiap ${status.minutes} menit: ${report.read} akun dibaca; ${report.created} baru, ${report.updated} diperbarui, ${report.linked} ditautkan${extra.length ? `; ${extra.join(", ")}` : ""}.`,
  };
}

export async function runAdDiagnostics({
  env = process.env,
  connect,
  now = () => new Date(),
  syncStatus = directorySyncStatus,
}: {
  env?: LdapEnv;
  connect?: () => Promise<LdapClientLike>;
  now?: () => Date;
  syncStatus?: () => DirectorySyncStatus;
} = {}): Promise<AdDiagnosticReport> {
  const checks: AdDiagnosticCheck[] = [];
  const production = env.NODE_ENV === "production";
  const driver = env.AD_DRIVER?.trim().toLowerCase() || "(belum diset)";
  const password = env.AD_BIND_PASSWORD ?? "";
  let writeEnabled = env.AD_LDAP_WRITE_ENABLED?.trim().toLowerCase() === "true";
  let config: ReturnType<typeof readLdapAdConfig> | undefined;
  let client: LdapClientLike | undefined;

  const loginUrl = (env.AD_LDAP_URL ?? env.LDAP_URL)?.trim() ?? "";
  let parsedLoginUrl: URL | undefined;
  try {
    if (!loginUrl) throw new Error("AD_LDAP_URL/LDAP_URL belum diisi.");
    parsedLoginUrl = new URL(loginUrl);
    if (parsedLoginUrl.protocol !== "ldaps:") {
      throw new Error("Login Active Directory harus memakai LDAPS.");
    }
    if (parsedLoginUrl.port && parsedLoginUrl.port !== "636") {
      throw new Error("Login Active Directory harus memakai port 636.");
    }
    checks.push({ id: "login-url", status: "ok", message: "URL login memakai LDAPS." });
  } catch (error) {
    checks.push({
      id: "login-url",
      status: production || driver === "ldap" ? "fail" : "warn",
      message: errorMessage(error, password),
    });
  }

  const roleGroups = [
    ["AD_GROUP_HC", env.AD_GROUP_HC],
    ["AD_GROUP_ADMIN / LDAP_ADMIN_GROUP", env.AD_GROUP_ADMIN ?? env.LDAP_ADMIN_GROUP],
    ["AD_GROUP_OPS", env.AD_GROUP_OPS],
    ["AD_GROUP_AUDITOR", env.AD_GROUP_AUDITOR],
  ];
  const missingRoleGroups = roleGroups.filter(([, value]) => !value?.trim()).map(([name]) => name);
  checks.push({
    id: "role-groups",
    status: missingRoleGroups.length ? "warn" : "ok",
    message: missingRoleGroups.length
      ? `Group peran belum disetel: ${missingRoleGroups.join(", ")}.`
      : "Semua group peran portal sudah disetel.",
  });

  if (driver === "ldap") {
    checks.push({ id: "driver", status: "ok", message: "Driver LDAP aktif." });
    try {
      config = readLdapAdConfig(env);
      writeEnabled = config.writeEnabled;
      checks.push({ id: "config", status: "ok", message: "Konfigurasi driver LDAP lengkap." });
    } catch (error) {
      checks.push({ id: "config", status: "fail", message: errorMessage(error, password) });
    }
  } else {
    // A fail in every environment: without the LDAP driver the worker cannot
    // carry out anything, and there is no simulated directory to fall back on.
    checks.push({
      id: "driver",
      status: "fail",
      message:
        driver === "mock"
          ? "AD_DRIVER=mock sudah tidak ada: direktori simulasi telah dihapus. Ganti menjadi AD_DRIVER=ldap."
          : "AD_DRIVER belum disetel ke ldap, jadi worker tidak bisa menjalankan perubahan apa pun.",
    });
    checks.push({ id: "config", status: "skip", message: "Konfigurasi LDAP tidak dapat diperiksa." });
  }

  if (!config) {
    checks.push({ id: "ca", status: "skip", message: "CA tidak diperiksa karena konfigurasi LDAP belum siap." });
    checks.push({ id: "bind", status: "skip", message: "Bind tidak dijalankan karena konfigurasi LDAP belum siap." });
    checks.push({ id: "base-dn", status: "skip", message: "Base DN tidak diperiksa karena bind tidak dijalankan." });
    checks.push({ id: "managed-ous", status: "skip", message: "OU kelola tidak diperiksa karena bind tidak dijalankan." });
    checks.push({ id: "quarantine-ou", status: "skip", message: "OU karantina tidak diperiksa karena bind tidak dijalankan." });
  } else {
    let caValid = false;
    try {
      const ca = await readLdapCa(config.caCertPath);
      const certificate = new X509Certificate(ca);
      const expiresAt = new Date(certificate.validTo);
      const remainingMs = expiresAt.getTime() - now().getTime();
      const expired = remainingMs <= 0;
      const expiresSoon = !expired && remainingMs < 30 * 24 * 60 * 60 * 1000;
      checks.push({
        id: "ca",
        status: expired ? "fail" : expiresSoon ? "warn" : "ok",
        message: `CA ${certificate.subject}; berlaku sampai ${expiresAt.toISOString()}.`,
      });
      caValid = !expired;
    } catch (error) {
      checks.push({ id: "ca", status: "fail", message: errorMessage(error, password) });
    }

    if (!caValid) {
      checks.push({ id: "bind", status: "skip", message: "Bind tidak dijalankan karena CA gagal diverifikasi." });
      checks.push({ id: "base-dn", status: "skip", message: "Base DN tidak diperiksa karena bind tidak dijalankan." });
      checks.push({ id: "managed-ous", status: "skip", message: "OU kelola tidak diperiksa karena bind tidak dijalankan." });
      checks.push({ id: "quarantine-ou", status: "skip", message: "OU karantina tidak diperiksa karena bind tidak dijalankan." });
    } else {
      try {
        client = await (connect ?? ldapConnector(config))();
        checks.push({ id: "bind", status: "ok", message: "Bind akun layanan berhasil." });
      } catch (error) {
        const classified = toAdError(error, "read", "Bind akun layanan gagal");
        checks.push({
          id: "bind",
          status: "fail",
          message:
            classified.kind === "PERMISSION"
              ? "Bind ditolak oleh Active Directory (PERMISSION); periksa DN dan hak akun layanan."
              : `Domain controller tidak terjangkau: ${errorMessage(error, password)}`,
        });
      }

      if (client) {
        try {
          try {
            await checkDn(checks, client, "base-dn", config.baseDn, password);
            if (config.managedOus.length === 0) {
              checks.push({
                id: "managed-ous",
                status: config.writeEnabled ? "fail" : "warn",
                message: "AD_MANAGED_OUS belum berisi OU.",
              });
            } else {
              const missing: string[] = [];
              for (const ou of config.managedOus) {
                const exists = await hasEntry(client, ou).catch((error: unknown) => {
                  throw new Error(`${ou}: ${errorMessage(error, password)}`);
                });
                if (!exists) missing.push(ou);
              }
              checks.push({
                id: "managed-ous",
                status: missing.length ? "fail" : "ok",
                message: missing.length
                  ? `OU berikut tidak ditemukan: ${missing.join("; ")}.`
                  : `${config.managedOus.length} OU kelola ditemukan.`,
              });
            }
          } catch (error) {
            checks.push({ id: "managed-ous", status: "fail", message: errorMessage(error, password) });
          }

          const configuredQuarantine = env.AD_QUARANTINE_OU?.trim();
          if (!configuredQuarantine) {
            checks.push({
              id: "quarantine-ou",
              status: "fail",
              message: "AD_QUARANTINE_OU wajib disetel; nilai bawaan adalah OU contoh dan tidak aman.",
            });
          } else if (!isManaged(configuredQuarantine, config.managedOus)) {
            checks.push({
              id: "quarantine-ou",
              status: "fail",
              message: `${configuredQuarantine} berada di luar AD_MANAGED_OUS.`,
            });
          } else {
            await checkDn(checks, client, "quarantine-ou", configuredQuarantine, password);
          }

          await checkDepartmentOus(checks, client, env, config.managedOus, password);

          const cisoGroup = env.CISO_APPROVER_GROUP?.trim();
          if (!cisoGroup) {
            checks.push({ id: "ciso-group", status: "skip", message: "CISO_APPROVER_GROUP tidak disetel." });
          } else {
            await checkDn(checks, client, "ciso-group", cisoGroup, password);
          }
        } finally {
          await client.close();
        }
      }
    }
  }

  if (!checks.some((check) => check.id === "department-ous")) {
    checks.push({
      id: "department-ous",
      status: "skip",
      message:
        env.AD_DEPARTMENT_OUS?.trim() || env.AD_DEPARTMENT_OU_PARENT?.trim()
          ? "OU divisi tidak diperiksa karena koneksi LDAP tidak tersedia."
          : "AD_DEPARTMENT_OUS dan AD_DEPARTMENT_OU_PARENT kosong: semua akun baru masuk AD_OU_STANDARD.",
    });
  }

  if (!checks.some((check) => check.id === "ciso-group")) {
    checks.push({
      id: "ciso-group",
      status: "skip",
      message: env.CISO_APPROVER_GROUP?.trim()
        ? "Group CISO tidak diperiksa karena koneksi LDAP tidak tersedia."
        : "CISO_APPROVER_GROUP tidak disetel.",
    });
  }

  if (!writeEnabled) {
    checks.push({ id: "write", status: "warn", message: "Mode baca: AD_LDAP_WRITE_ENABLED=false." });
  } else {
    checks.push({ id: "write", status: "ok", message: "Penulisan LDAP diaktifkan." });
  }

  checks.push(employeeSyncCheck(syncStatus(), driver));

  const overall = checks.reduce<AdCheckStatus>(
    (worst, check) => (STATUS_WEIGHT[check.status] > STATUS_WEIGHT[worst] ? check.status : worst),
    "skip",
  );
  return { checkedAt: now().toISOString(), driver, writeEnabled, overall, checks };
}
