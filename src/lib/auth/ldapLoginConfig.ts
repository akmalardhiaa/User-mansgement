import { AdConfigurationError } from "@/lib/ad/configError";

export interface LdapLoginConfig {
  url: string;
  domain?: string;
  baseDn: string;
  caCertPath: string;
}

type LdapLoginEnv = Record<string, string | undefined>;

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function isLdapLoginConfigured(env: LdapLoginEnv = process.env): boolean {
  return Boolean(trimmed(env.AD_LDAP_URL) || trimmed(env.LDAP_URL));
}

export function readLdapLoginConfig(env: LdapLoginEnv = process.env): LdapLoginConfig {
  const url = trimmed(env.AD_LDAP_URL) || trimmed(env.LDAP_URL);
  const baseDn = trimmed(env.AD_BASE_DN) || trimmed(env.LDAP_BASE_DN);
  const caCertPath = trimmed(env.LDAP_CA_CERT_PATH);

  const missing = [
    [url, "AD_LDAP_URL (atau LDAP_URL)"],
    [baseDn, "AD_BASE_DN (atau LDAP_BASE_DN)"],
    [caCertPath, "LDAP_CA_CERT_PATH"],
  ]
    .filter(([value]) => !value)
    .map(([, name]) => name);

  if (missing.length > 0) {
    throw new AdConfigurationError(
      `Login Active Directory membutuhkan variabel berikut dan belum diisi: ${missing.join(", ")}.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AdConfigurationError(`AD_LDAP_URL/LDAP_URL="${url}" bukan URL yang sah.`);
  }

  if (parsed.protocol !== "ldaps:") {
    throw new AdConfigurationError(
      `Login Active Directory hanya menerima ldaps://; koneksi LDAP tanpa TLS ditolak.`,
    );
  }
  if (parsed.port && parsed.port !== "636") {
    throw new AdConfigurationError(
      `Login Active Directory hanya menerima port 636 (diberi ${parsed.port}).`,
    );
  }

  return {
    url,
    domain: trimmed(env.LDAP_DOMAIN) || undefined,
    baseDn,
    caCertPath,
  };
}
