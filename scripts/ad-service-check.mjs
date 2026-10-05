// Read-only smoke test for the service account the AD driver writes with.
//
//   npm run ad:service-check -- <sAMAccountName> [<group DN>]
//
// It binds as AD_BIND_DN over LDAPS, reads one account, and reads one group.
// It never writes, whatever AD_LDAP_WRITE_ENABLED says, so it is safe to point
// at a production domain controller before anything else is.
//
// Why this exists next to `npm run ad:check`: that script binds as the PERSON
// signing in and answers "can this user log in, and what roles do they get".
// This one answers a different question — "can the service account see what the
// worker needs to see" — and the two failing for different reasons is precisely
// what you want to be able to tell apart.
//
// The GUID decoding and the filter escaping below mirror
// src/lib/ad/ldapGuid.ts and src/lib/ad/ldapFilter.ts. They are repeated here
// rather than imported because this is a plain .mjs diagnostic and those are
// TypeScript; if they ever disagree, the modules are right and this is stale.

import { readFile } from "node:fs/promises";

import nextEnv from "@next/env";
import { Client } from "ldapts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const [, , account, groupArgument] = process.argv;

const url = (process.env.AD_LDAP_URL ?? process.env.LDAP_URL ?? "").trim();
const baseDn = (process.env.AD_BASE_DN ?? process.env.LDAP_BASE_DN ?? "").trim();
const bindDn = (process.env.AD_BIND_DN ?? "").trim();
const bindPassword = process.env.AD_BIND_PASSWORD ?? "";
const caPath = (process.env.LDAP_CA_CERT_PATH ?? "").trim();
const managedOus = (process.env.AD_MANAGED_OUS ?? "")
  .split(";")
  .map((entry) => entry.trim())
  .filter(Boolean);
const group = (groupArgument ?? process.env.CISO_APPROVER_GROUP ?? "").trim();
const writeEnabled = (process.env.AD_LDAP_WRITE_ENABLED ?? "").trim().toLowerCase() === "true";

function bail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!account) bail("Pakai: npm run ad:service-check -- <sAMAccountName> [<group DN>]");

const missing = [
  [url, "AD_LDAP_URL (atau LDAP_URL)"],
  [baseDn, "AD_BASE_DN (atau LDAP_BASE_DN)"],
  [bindDn, "AD_BIND_DN"],
  [bindPassword, "AD_BIND_PASSWORD"],
  [caPath, "LDAP_CA_CERT_PATH"],
  [!writeEnabled || managedOus.length ? "ada" : "", "AD_MANAGED_OUS (wajib saat penulisan diaktifkan)"],
]
  .filter(([value]) => !value)
  .map(([, name]) => name);

if (missing.length > 0) bail(`Belum diisi di .env.local: ${missing.join(", ")}`);
let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch {
  bail("AD_LDAP_URL/LDAP_URL bukan URL yang sah.");
}
if (parsedUrl.protocol !== "ldaps:" || (parsedUrl.port && parsedUrl.port !== "636")) {
  bail(`Driver AD hanya menerima ldaps:// port 636 (diberi "${url}").`);
}

function escapeFilterValue(value) {
  return value.replace(/[\\*()\0]/g, (char) => `\\${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

/** Little-endian on the first three fields — see src/lib/ad/ldapGuid.ts. */
function guidFromBytes(bytes) {
  const order = [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15];
  const hex = order.map((index) => bytes[index].toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

const ATTRIBUTES = [
  "objectGUID",
  "distinguishedName",
  "sAMAccountName",
  "userPrincipalName",
  "displayName",
  "mail",
  "department",
  "title",
  "manager",
  "userAccountControl",
  "memberOf",
];

function one(value) {
  if (Array.isArray(value)) return value.length ? String(value[0]) : "";
  return value === undefined || value === null ? "" : String(value);
}

function many(value) {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined || value === null ? [] : [String(value)];
}

function insideManagedOu(dn) {
  const parts = (text) =>
    text
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  const subject = parts(dn);
  return managedOus.some((ou) => {
    const parent = parts(ou);
    if (subject.length <= parent.length) return false;
    const offset = subject.length - parent.length;
    return parent.every((part, index) => subject[offset + index] === part);
  });
}

const ca = await readFile(caPath).catch((error) =>
  bail(`Sertifikat CA di LDAP_CA_CERT_PATH="${caPath}" tidak bisa dibaca: ${error.message}`),
);

const client = new Client({
  url,
  timeout: 10_000,
  connectTimeout: 10_000,
  tlsOptions: {
    ca,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    servername: new URL(url).hostname,
  },
});

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  console.info(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
}

try {
  console.info(`\n  Menyambung ke ${url} (LDAPS, CA dari ${caPath}) …`);
  await client.bind(bindDn, bindPassword);
  check("bind akun layanan berhasil", true, bindDn);

  const { searchEntries } = await client.search(baseDn, {
    scope: "sub",
    filter: `(&(objectCategory=person)(objectClass=user)(sAMAccountName=${escapeFilterValue(account)}))`,
    attributes: ATTRIBUTES,
    explicitBufferAttributes: ["objectGUID"],
  });

  check(`akun ${account} ditemukan`, searchEntries.length === 1, `${searchEntries.length} hasil`);

  const entry = searchEntries[0];
  if (entry) {
    const dn = one(entry.distinguishedName) || entry.dn;
    const uac = Number.parseInt(one(entry.userAccountControl), 10);

    check("objectGUID terbaca sebagai biner", Buffer.isBuffer(entry.objectGUID));
    if (Buffer.isBuffer(entry.objectGUID)) {
      console.info(`     objectGUID   ${guidFromBytes(entry.objectGUID)}`);
    }
    console.info(`     DN           ${dn}`);
    console.info(`     nama         ${one(entry.displayName)} <${one(entry.mail)}>`);
    console.info(`     divisi       ${one(entry.department)} · ${one(entry.title)}`);
    console.info(`     manager      ${one(entry.manager) || "—"}`);
    check("userAccountControl terbaca", !Number.isNaN(uac), `${uac} (aktif: ${(uac & 0x2) === 0})`);
    if (managedOus.length) {
      check("objek berada di dalam AD_MANAGED_OUS", insideManagedOu(dn), dn);
    } else {
      console.info("     OU kelola     belum diizinkan (read-only; AD_MANAGED_OUS kosong)");
    }
    console.info(`     memberOf     ${many(entry.memberOf).length} group`);
  }

  if (group) {
    const { searchEntries: groups } = await client.search(baseDn, {
      scope: "sub",
      filter: `(&(objectClass=group)(distinguishedName=${escapeFilterValue(group)}))`,
      attributes: ["distinguishedName"],
    });
    check(`group ${group} ditemukan`, groups.length === 1);

    const { searchEntries: members } = await client.search(baseDn, {
      scope: "sub",
      filter: `(&(objectCategory=person)(objectClass=user)(memberOf=${escapeFilterValue(group)}))`,
      attributes: ["sAMAccountName", "mail", "userAccountControl"],
      paged: { pageSize: 200 },
    });

    const answerable = members.filter(
      (member) =>
        (Number.parseInt(one(member.userAccountControl), 10) & 0x2) === 0 && one(member.mail),
    );
    check(
      "anggota group bisa dimintai persetujuan",
      answerable.length > 0,
      `${answerable.length} dari ${members.length} anggota aktif dan punya email`,
    );
    for (const member of answerable.slice(0, 5)) {
      console.info(`     · ${one(member.sAMAccountName)} <${one(member.mail)}>`);
    }
  } else {
    console.info("  … lewati pemeriksaan group: tidak ada argumen dan CISO_APPROVER_GROUP kosong.");
  }

  console.info(
    `\n  Penulisan ke AD: ${
      writeEnabled
        ? "AKTIF (AD_LDAP_WRITE_ENABLED=true)"
        : "mati — driver hanya membaca"
    }`,
  );
  console.info(`  OU yang boleh ditulis: ${managedOus.join(" ; ")}\n`);
} catch (error) {
  // The password is never printed, and nothing here echoes the environment.
  bail(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await client.unbind().catch(() => undefined);
}

process.exit(failures > 0 ? 1 : 0);
