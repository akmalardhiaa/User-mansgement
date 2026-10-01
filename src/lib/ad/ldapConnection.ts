import { readFile } from "node:fs/promises";

import { AdConfigurationError } from "./configError";
import type { DirectoryEntry } from "./ldapEntry";

/**
 * The LDAPS connection this application writes to Active Directory through.
 *
 * Separate from `src/lib/auth/ad.ts` on purpose, and the reason is not
 * tidiness. That module binds as the PERSON signing in, with the password they
 * typed, and proves nothing except who they are. This one binds as a service
 * account that can change group membership and disable accounts. Sharing one
 * client, one set of credentials or one code path between the two would make a
 * bug in the login screen a bug in the thing holding write access to the
 * directory.
 *
 * Three things are deliberately not configurable, because a deployment that
 * wants them configurable wants something this application should not do:
 *
 *   1. `ldaps://` only. The service account password crosses this connection on
 *      every operation. StartTLS on 389 would be acceptable in principle and is
 *      not implemented, because "acceptable in principle" is how a plaintext
 *      fallback ends up in production.
 *   2. The certificate chain is verified against `LDAP_CA_CERT_PATH`, and
 *      `rejectUnauthorized` is never false. An internal CA is normal for AD;
 *      skipping verification to cope with one means anything on the network
 *      path can answer as the domain controller and be believed.
 *   3. Hostname verification stays on, so a valid certificate issued to some
 *      OTHER host by the same CA is not accepted for this one.
 *
 * The client interface below is this application's own rather than the LDAP
 * library's. The driver is then testable against a fake directory instead of
 * only against a real domain controller — and the fake has to implement the
 * same handful of operations, which is what makes such a test worth anything.
 */

export interface LdapSearchOptions {
  scope: "base" | "one" | "sub";
  filter: string;
  attributes: readonly string[];
  /** Attributes that must come back as bytes. objectGUID, in practice. */
  binaryAttributes?: readonly string[];
  /** Page size, for a search that may return more entries than a DC returns at once. */
  pageSize?: number;
  sizeLimit?: number;
}

export interface LdapChange {
  operation: "add" | "delete" | "replace";
  attribute: string;
  values: readonly string[];
}

export interface LdapClientLike {
  search(baseDn: string, options: LdapSearchOptions): Promise<DirectoryEntry[]>;
  add(dn: string, entry: Record<string, string | string[]>): Promise<void>;
  modify(dn: string, changes: readonly LdapChange[]): Promise<void>;
  modifyDn(dn: string, newDn: string): Promise<void>;
  /** Closes the connection. Called in a finally, and never allowed to throw. */
  close(): Promise<void>;
}

/** Opens a bound connection. One per operation — see LdapAdDriver. */
export type LdapConnect = () => Promise<LdapClientLike>;

export interface LdapAdConfig {
  url: string;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
  caCertPath: string;
  /** Containers this application may write inside. Nothing else is writable. */
  managedOus: string[];
  writeEnabled: boolean;
  nestedGroups: boolean;
  timeoutMs: number;
  pageSize: number;
}

/**
 * Just the names this reads.
 *
 * Not `NodeJS.ProcessEnv`, which the framework declares NODE_ENV on as a
 * required read-only property — so a test could not hand this function a
 * handful of variables without also asserting something about the environment
 * it is pretending to be.
 */
export type LdapEnv = Record<string, string | undefined>;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PAGE_SIZE = 200;

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function flag(value: string | undefined): boolean {
  return trimmed(value).toLowerCase() === "true";
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  const raw = trimmed(value);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new AdConfigurationError(`${name}="${raw}" bukan angka positif.`);
  }
  return parsed;
}

/**
 * Checks the URL is one this driver will bind a service account over.
 *
 * The port is pinned as well as the scheme. 636 is LDAPS; 3269 is the global
 * catalog, which answers reads for the whole forest and is a different thing to
 * point write operations at — so using it has to be a decision somebody makes,
 * not a digit somebody changed.
 */
function checkUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AdConfigurationError(`AD_LDAP_URL/LDAP_URL="${url}" bukan URL yang sah.`);
  }

  if (parsed.protocol !== "ldaps:") {
    throw new AdConfigurationError(
      `Driver AD hanya menerima ldaps:// (diberi "${url}"). Kata sandi akun layanan melewati koneksi ini pada setiap operasi.`,
    );
  }
  if (parsed.port && parsed.port !== "636") {
    throw new AdConfigurationError(
      `Driver AD hanya menerima port 636 (diberi ${parsed.port}). Global catalog 3269 melayani seluruh forest dan bukan tempat menulis.`,
    );
  }
  if (!parsed.hostname) {
    throw new AdConfigurationError(`AD_LDAP_URL/LDAP_URL="${url}" tidak menyebut host.`);
  }
}

/**
 * The configuration, or one error naming exactly what is missing.
 *
 * One error listing every empty variable rather than failing on the first:
 * whoever is setting this up is reading a log, and five restarts to discover
 * five missing names is four restarts too many.
 */
export function readLdapAdConfig(env: LdapEnv = process.env): LdapAdConfig {
  const url = trimmed(env.AD_LDAP_URL) || trimmed(env.LDAP_URL);
  const baseDn = trimmed(env.AD_BASE_DN) || trimmed(env.LDAP_BASE_DN);
  const bindDn = trimmed(env.AD_BIND_DN);
  const bindPassword = env.AD_BIND_PASSWORD ?? "";
  const caCertPath = trimmed(env.LDAP_CA_CERT_PATH);
  const managedOus = trimmed(env.AD_MANAGED_OUS)
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const writeEnabled = flag(env.AD_LDAP_WRITE_ENABLED);

  const missing = [
    [url, "AD_LDAP_URL (atau LDAP_URL)"],
    [baseDn, "AD_BASE_DN (atau LDAP_BASE_DN)"],
    [bindDn, "AD_BIND_DN"],
    [bindPassword, "AD_BIND_PASSWORD"],
    [caCertPath, "LDAP_CA_CERT_PATH"],
    [!writeEnabled || managedOus.length ? "ada" : "", "AD_MANAGED_OUS (wajib saat penulisan diaktifkan)"],
  ]
    .filter(([value]) => !value)
    .map(([, name]) => name);

  if (missing.length > 0) {
    throw new AdConfigurationError(
      `AD_DRIVER=ldap membutuhkan variabel berikut dan belum diisi: ${missing.join(", ")}.`,
    );
  }

  checkUrl(url);

  return {
    url,
    baseDn,
    bindDn,
    bindPassword,
    caCertPath,
    managedOus,
    writeEnabled,
    nestedGroups: flag(env.LDAP_NESTED_GROUPS),
    timeoutMs: positiveInt(env.LDAP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "LDAP_TIMEOUT_MS"),
    pageSize: positiveInt(env.LDAP_PAGE_SIZE, DEFAULT_PAGE_SIZE, "LDAP_PAGE_SIZE"),
  };
}

/**
 * The CA bundle, read once per path.
 *
 * Cached because this driver opens a connection per operation, and reading a
 * certificate off disk for each one is work nobody asked for. A rotated CA
 * therefore needs a restart — the same as every other value in this
 * configuration.
 */
const caCache = new Map<string, Promise<Buffer>>();

function readCa(path: string): Promise<Buffer> {
  const cached = caCache.get(path);
  if (cached) return cached;

  const loading = readFile(path).catch((error: unknown) => {
    caCache.delete(path);
    throw new AdConfigurationError(
      `Sertifikat CA di LDAP_CA_CERT_PATH="${path}" tidak bisa dibaca: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
  caCache.set(path, loading);
  return loading;
}

/** Test seam: forgets the cached CA bundles. */
export function resetLdapCaCache(): void {
  caCache.clear();
}

/**
 * Opens a connection and binds the service account.
 *
 * The LDAP client is imported dynamically, the way the login path does it, so
 * nothing about it is pulled into a build that never talks to a directory.
 */
export function ldapConnector(config: LdapAdConfig): LdapConnect {
  return async () => {
    const { Attribute, Change, Client } = await import("ldapts");
    const ca = await readCa(config.caCertPath);

    const client = new Client({
      url: config.url,
      timeout: config.timeoutMs,
      connectTimeout: config.timeoutMs,
      tlsOptions: {
        ca,
        // Belt and braces: verification is already the default. It is spelled
        // out where somebody would otherwise be tempted to turn it off.
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        servername: new URL(config.url).hostname,
      },
    });

    await client.bind(config.bindDn, config.bindPassword);

    const wrapper: LdapClientLike = {
      async search(baseDn, options) {
        const { searchEntries } = await client.search(baseDn, {
          scope: options.scope,
          filter: options.filter,
          attributes: [...options.attributes],
          explicitBufferAttributes: options.binaryAttributes
            ? [...options.binaryAttributes]
            : undefined,
          paged: options.pageSize ? { pageSize: options.pageSize } : undefined,
          sizeLimit: options.sizeLimit,
        });
        return searchEntries as DirectoryEntry[];
      },

      async add(dn, entry) {
        await client.add(dn, entry);
      },

      async modify(dn, changes) {
        await client.modify(
          dn,
          changes.map(
            (change) =>
              new Change({
                operation: change.operation,
                modification: new Attribute({
                  type: change.attribute,
                  values: [...change.values],
                }),
              }),
          ),
        );
      },

      async modifyDn(dn, newDn) {
        await client.modifyDN(dn, newDn);
      },

      async close() {
        // An unbind that fails has nothing left to protect: the operation is
        // over either way, and letting it throw would replace a real result
        // with the failure of the cleanup after it.
        await client.unbind().catch(() => undefined);
      },
    };

    return wrapper;
  };
}
