// Tests the Active Directory (LDAP) connection from the command line, without
// going through the web app. Run it once a real AD server is configured to
// confirm the credentials and the base DN before wiring up the portal:
//
//   npm run ad:check -- <username>
//
// It reads the login and role-group settings from .env.local — the same values
// the app uses (see .env.example).

import nextEnv from "@next/env";
import { readFile } from "node:fs/promises";
import { Client } from "ldapts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const [, , username] = process.argv;

const url = (process.env.AD_LDAP_URL ?? process.env.LDAP_URL)?.trim();
if (!url) {
  console.error(
    "\n  AD_LDAP_URL/LDAP_URL belum diset di .env.local.\n" +
      "  Isi dulu konfigurasi AD (lihat .env.example), lalu jalankan lagi.\n",
  );
  process.exit(1);
}
if (!username) {
  console.error("\n  Pakai: npm run ad:check -- <username>\n");
  process.exit(1);
}

const domain = process.env.LDAP_DOMAIN?.trim();
const baseDN = (process.env.AD_BASE_DN ?? process.env.LDAP_BASE_DN)?.trim() ?? "";
const caPath = process.env.LDAP_CA_CERT_PATH?.trim();
const roleGroups = [
  ["HC_REQUESTER", process.env.AD_GROUP_HC],
  ["SYSTEM_ADMIN", process.env.AD_GROUP_ADMIN ?? process.env.LDAP_ADMIN_GROUP],
  ["OPS_OPERATOR", process.env.AD_GROUP_OPS],
  ["AUDITOR", process.env.AD_GROUP_AUDITOR],
].filter(([, group]) => group?.trim());

function requireConfig(value, name) {
  if (!value) {
    console.error(`\n  ${name} belum diset di environment AD.\n`);
    process.exit(1);
  }
}

requireConfig(baseDN, "AD_BASE_DN/LDAP_BASE_DN");
requireConfig(caPath, "LDAP_CA_CERT_PATH");

let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch {
  console.error("\n  AD_LDAP_URL/LDAP_URL bukan URL yang sah.\n");
  process.exit(1);
}
if (parsedUrl.protocol !== "ldaps:" || (parsedUrl.port && parsedUrl.port !== "636")) {
  console.error("\n  Login AD hanya menerima LDAPS pada port 636.\n");
  process.exit(1);
}

const bindName =
  username.includes("@") || username.includes("\\") || !domain ? username : `${username}@${domain}`;
const account = username.split("\\").pop().split("@")[0];

function escapeFilter(value) {
  return value.replace(/[\\*()\0]/g, (char) => `\\${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

function firstString(value) {
  if (Array.isArray(value)) return value.length ? String(value[0]) : "";
  return value === undefined || value === null ? "" : String(value);
}

// Mirrors matchesGroup in src/lib/auth/roleMapping.ts. A substring test would
// report ADMIN for membership of `CN=Former HC Admins`, and a diagnostic that
// disagrees with the app it is meant to be checking is worse than none.
function components(dn) {
  return dn
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function matchesGroup(memberOf, configured) {
  const group = components(memberOf);
  const needle = components(configured);
  if (group.length === 0 || needle.length === 0) return false;

  if (needle.length === 1 && !needle[0].includes("=")) {
    const [attribute, ...value] = group[0].split("=");
    return attribute === "cn" && value.join("=") === needle[0];
  }

  return needle.every((part, index) => group[index] === part);
}

const ca = await readFile(caPath).catch((error) => {
  console.error(`\n  Sertifikat CA tidak bisa dibaca: ${error.message}\n`);
  process.exit(1);
});

function promptPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Jalankan ad:check dari terminal interaktif agar kata sandi tidak masuk argumen proses.");
  }

  return new Promise((resolve, reject) => {
    let password = "";
    const input = process.stdin;
    const output = process.stdout;

    function cleanup() {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    }

    function onData(chunk) {
      for (const character of chunk.toString("utf8")) {
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(password);
          return;
        }
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Pemeriksaan dibatalkan."));
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1);
        } else if (character >= " ") {
          password += character;
        }
      }
    }

    output.write("Kata sandi AD (tidak ditampilkan): ");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

let password;
try {
  password = await promptPassword();
} catch (error) {
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
}

const client = new Client({
  url,
  timeout: 8000,
  connectTimeout: 8000,
  tlsOptions: {
    ca,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    servername: parsedUrl.hostname,
  },
});

try {
  console.info(`\n  Menyambung ke ${url} …`);
  await client.bind(bindName, password);
  console.info(`  ✓ Bind berhasil sebagai ${bindName}`);

  const filter = `(&(objectClass=user)(|(userPrincipalName=${escapeFilter(bindName)})(sAMAccountName=${escapeFilter(account)})))`;
  const { searchEntries } = await client.search(baseDN, {
    scope: "sub",
    filter,
    attributes: ["displayName", "mail", "department", "memberOf", "sAMAccountName"],
  });

  const entry = searchEntries[0];
  if (!entry) {
    console.info(
      "  ⚠ Bind berhasil, tetapi record user tidak ditemukan di BASE_DN.\n" +
        "    Periksa LDAP_BASE_DN.\n",
    );
    process.exitCode = 1;
  } else {
    const groups = [].concat(entry.memberOf ?? []).map(String);
    const roles = roleGroups
      .filter(([, configured]) =>
        groups.some((group) => matchesGroup(group, configured.trim().toLowerCase())),
      )
      .map(([role]) => role);
    console.info("  Nama    : " + (firstString(entry.displayName) || "(kosong)"));
    console.info("  Email   : " + (firstString(entry.mail) || "(kosong)"));
    console.info("  Divisi  : " + (firstString(entry.department) || "(kosong)"));
    console.info("  Peran   : " + (roles.join(", ") || "(tidak ada group portal)"));
    console.info(
      roles.length
        ? "\n  ✓ Login dan pemetaan peran berhasil.\n"
        : "\n  ✗ Akun tidak memiliki group peran portal; login portal akan ditolak.\n",
    );
    if (roles.length === 0) process.exitCode = 1;
  }
} catch (error) {
  console.error(`\n  ✗ Gagal: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await client.unbind().catch(() => undefined);
}
