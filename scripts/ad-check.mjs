// Tests the Active Directory (LDAP) connection from the command line, without
// going through the web app. Run it once a real AD server is configured to
// confirm the credentials and the base DN before wiring up the portal:
//
//   npm run ad:check -- <username> <password>
//
// It reads LDAP_URL, LDAP_DOMAIN, LDAP_BASE_DN and LDAP_ADMIN_GROUP from
// .env.local — the same variables the app uses (see .env.example).

import nextEnv from "@next/env";
import { Client } from "ldapts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const [, , username, password] = process.argv;

const url = process.env.LDAP_URL?.trim();
if (!url) {
  console.error(
    "\n  LDAP_URL belum diset di .env.local.\n" +
      "  Isi dulu konfigurasi AD (lihat .env.example), lalu jalankan lagi.\n",
  );
  process.exit(1);
}
if (!username || !password) {
  console.error("\n  Pakai: npm run ad:check -- <username> <password>\n");
  process.exit(1);
}

const domain = process.env.LDAP_DOMAIN?.trim();
const baseDN = process.env.LDAP_BASE_DN?.trim() ?? "";
const adminGroup = process.env.LDAP_ADMIN_GROUP?.trim().toLowerCase();

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

const client = new Client({ url, timeout: 8000, connectTimeout: 8000 });

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
  } else {
    const groups = [].concat(entry.memberOf ?? []).map(String);
    const role = adminGroup && groups.some((group) => group.toLowerCase().includes(adminGroup)) ? "ADMIN" : "USER";
    console.info("  Nama    : " + (firstString(entry.displayName) || "(kosong)"));
    console.info("  Email   : " + (firstString(entry.mail) || "(kosong)"));
    console.info("  Divisi  : " + (firstString(entry.department) || "(kosong)"));
    console.info("  Peran   : " + role);
    console.info("\n  ✓ Konfigurasi AD siap dipakai portal.\n");
  }
} catch (error) {
  console.error(`\n  ✗ Gagal: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await client.unbind().catch(() => undefined);
}
