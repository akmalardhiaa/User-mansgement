// Gives the simulated directory a cast that can actually approve something,
// and can take it back again.
//
//   npm run mock-ad:roles           grant the role groups
//   npm run mock-ad:roles -- --undo remove exactly what the last run added
//
// The problem it solves: data/mock-ad.json is seeded from the employee roster,
// so every account carries only ACCESS groups (CN=HC-Base and friends) and no
// ROLE groups at all. Turn on MOCK_AD_LOGIN against that and all twenty accounts
// sign in with an empty role list — the portal is not broken, it is correctly
// reporting that nobody has been granted anything.
//
// Mapping CN=HC-Base to a role would be the wrong fix: eighteen of the twenty
// accounts hold it, so it would hand that authority to nearly everyone. Instead
// three named accounts are granted the three role groups, which is the smallest
// cast that can carry a request end to end:
//
//   ayu.prameswari   Head of Human Capital  ->  raises requests, administers
//   sarah.wijaya     Engineering Manager    ->  approves the first stage
//   bagus.nugroho    IT Security            ->  approves the access decision
//
// The DNs written are read from AD_GROUP_* in .env.local, so the directory and
// the configuration agree by construction and cannot drift apart. Where a
// variable is unset the documented example is used and printed for pasting.
//
// Every run records what it actually changed in an undo file next to the
// directory. `--undo` reverses precisely that and nothing else — it never
// guesses, so a group somebody added by hand survives, and an account that was
// already enabled before the grant is left enabled.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

// A simulated directory in production would be a directory of accounts nobody
// can account for. Refused for the same reason AD_DRIVER=mock is.
if (process.env.NODE_ENV === "production") {
  console.error("\n  Ditolak: ini fixture demo dan tidak boleh dijalankan di production.\n");
  process.exit(1);
}

const undoRequested = process.argv.includes("--undo");

/** Role group per portal role, from the environment or the documented example. */
const ROLES = [
  {
    env: "AD_GROUP_HC",
    fallback: "CN=HC Officers,OU=Groups,DC=corp,DC=example,DC=com",
    label: "HC_REQUESTER",
    accounts: ["ayu.prameswari"],
  },
  {
    env: "AD_GROUP_ADMIN",
    fallback: "CN=HC Portal Admins,OU=Groups,DC=corp,DC=example,DC=com",
    label: "SYSTEM_ADMIN",
    accounts: ["ayu.prameswari"],
  },
  {
    env: "AD_GROUP_MANAGER",
    fallback: "CN=Division Managers,OU=Groups,DC=corp,DC=example,DC=com",
    label: "MANAGER",
    accounts: ["sarah.wijaya"],
  },
  {
    env: "AD_GROUP_CISO",
    fallback: "CN=IT Security Approvers,OU=Groups,DC=corp,DC=example,DC=com",
    label: "CISO_APPROVER",
    accounts: ["bagus.nugroho"],
  },
];

function resolvePath() {
  const configured = process.env.AD_MOCK_FILE?.trim() || "data/mock-ad.json";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

const target = resolvePath();
const undoPath = `${target.replace(/\.json$/, "")}.undo.json`;

/** Write-then-rename, as the stores do: a crash must not truncate the directory. */
async function persist(file) {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

async function loadDirectory() {
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(
        `\n  ${target} belum ada.\n` +
          "  Jalankan portal dan seed direktori simulasi dulu,\n" +
          "  atau POST /api/admin/seed-mock-ad sebagai SYSTEM_ADMIN.\n",
      );
      process.exit(1);
    }
    throw error;
  }
}

function findAccount(accounts, name) {
  return accounts.find((candidate) => candidate.sAMAccountName.toLowerCase() === name.toLowerCase());
}

/* ------------------------------------------------------------------- undo */

if (undoRequested) {
  let record;
  try {
    record = JSON.parse(await readFile(undoPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(
        `\n  Tidak ada catatan perubahan di ${undoPath}.\n` +
          "  Berarti tidak ada yang perlu dikembalikan.\n",
      );
      process.exit(1);
    }
    throw error;
  }

  const file = await loadDirectory();
  const accounts = file.accounts ?? [];
  const removed = [];
  const disabled = [];

  for (const item of record.granted ?? []) {
    const account = findAccount(accounts, item.account);
    if (!account) continue;
    const before = account.groups.length;
    account.groups = account.groups.filter(
      (group) => group.toLowerCase() !== item.dn.toLowerCase(),
    );
    if (account.groups.length !== before) removed.push(item);
  }

  // Only accounts this script switched on. One that was already enabled before
  // the grant is left alone — undoing more than you did is its own kind of bug.
  for (const name of record.enabled ?? []) {
    const account = findAccount(accounts, name);
    if (!account || !account.enabled) continue;
    account.enabled = false;
    disabled.push(name);
  }

  await persist(file);
  await unlink(undoPath).catch(() => undefined);

  console.info(`\n  Dikembalikan pada ${target}\n`);
  for (const item of removed) {
    console.info(`  - ${item.label.padEnd(14)} ${item.account.padEnd(18)} ${item.dn}`);
  }
  for (const name of disabled) console.info(`  ~ dinonaktifkan  ${name}`);
  if (removed.length === 0 && disabled.length === 0) {
    console.info("  Tidak ada yang tersisa untuk dikembalikan.");
  }
  console.info("\n  Matikan juga login simulasi bila tidak dipakai lagi:\n");
  console.info("    MOCK_AD_LOGIN=false\n");
  console.info("  Akun demo (admin / admin12345) tetap berfungsi tanpa perubahan apa pun.\n");
  process.exit(0);
}

/* ------------------------------------------------------------------ grant */

const file = await loadDirectory();
const accounts = file.accounts ?? [];

if (accounts.length === 0) {
  console.error(`\n  ${target} kosong — tidak ada akun untuk diberi peran.\n`);
  process.exit(1);
}

const granted = [];
const enabled = [];
const missing = [];
const unset = [];

for (const role of ROLES) {
  const configured = process.env[role.env]?.trim();
  if (!configured) unset.push(role);
  const dn = configured || role.fallback;

  for (const name of role.accounts) {
    const account = findAccount(accounts, name);

    if (!account) {
      missing.push({ name, label: role.label });
      continue;
    }

    // Union rather than replace: the access groups the roster seeded are still
    // what this person's applications key on, and a re-run must not strip them.
    if (!account.groups.some((group) => group.toLowerCase() === dn.toLowerCase())) {
      account.groups = [...new Set([...account.groups, dn])].sort();
      granted.push({ account: name, label: role.label, dn });
    }

    // An account that is switched off cannot sign in — by design, see
    // mockAdAuth.ts. A cast member who cannot log in is not a cast member.
    if (!account.enabled) {
      account.enabled = true;
      enabled.push(name);
    }
  }
}

await persist(file);

/*
 * The undo record, merged with anything a previous run left behind.
 *
 * Merged rather than replaced because the grant is idempotent: running twice
 * changes nothing the second time, and overwriting the record with that empty
 * second result would throw away the only description of what the FIRST run did.
 */
let previous = { granted: [], enabled: [] };
try {
  previous = JSON.parse(await readFile(undoPath, "utf8"));
} catch {
  // No earlier run, or an unreadable record. Either way, start from this one.
}

const mergedGranted = [...(previous.granted ?? [])];
for (const item of granted) {
  const already = mergedGranted.some(
    (entry) => entry.account === item.account && entry.dn.toLowerCase() === item.dn.toLowerCase(),
  );
  if (!already) mergedGranted.push(item);
}

const record = {
  at: new Date().toISOString(),
  directory: target,
  granted: mergedGranted,
  enabled: [...new Set([...(previous.enabled ?? []), ...enabled])],
};

await writeFile(undoPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

/* ----------------------------------------------------------------- report */

console.info(`\n  Direktori simulasi: ${target}\n`);

if (granted.length === 0 && enabled.length === 0) {
  console.info("  Tidak ada perubahan — peran sudah terpasang sebelumnya.\n");
} else {
  for (const item of granted) {
    console.info(`  + ${item.label.padEnd(14)} ${item.account.padEnd(18)} ${item.dn}`);
  }
  for (const name of enabled) {
    console.info(`  ~ diaktifkan     ${name}`);
  }
  console.info("");
}

if (missing.length > 0) {
  console.info("  Akun berikut tidak ada di direktori, jadi dilewati:");
  for (const item of missing) console.info(`    - ${item.name} (${item.label})`);
  console.info("    Seed ulang direktori simulasi bila ini tidak disengaja.\n");
}

if (unset.length > 0) {
  console.info("  Belum diset di .env.local, jadi memakai contoh bawaan.");
  console.info("  Salin baris ini supaya portal memetakan grup yang baru ditulis:\n");
  for (const role of unset) console.info(`    ${role.env}=${role.fallback}`);
  console.info("");
}

console.info("  Lalu pastikan .env.local memuat:\n");
console.info("    MOCK_AD_LOGIN=true");
console.info(`    MOCK_AD_PASSWORD=${process.env.MOCK_AD_PASSWORD?.trim() || "mock12345"}\n`);
console.info("  Masuk sebagai ayu.prameswari, sarah.wijaya, atau bagus.nugroho.");
console.info(`  Untuk mengembalikan: npm run mock-ad:roles -- --undo\n`);
