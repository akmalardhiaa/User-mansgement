// Reset two-step verification for one person, for a lost or replaced phone.
//
//   npm run mfa:reset -- <username>      remove that person's authenticator
//   npm run mfa:reset -- --list          who has one enrolled, and since when
//
// On the office server, inside the container:
//
//   podman exec hc-portal node scripts/mfa-reset.mjs <username>
//
// The person connects a new phone at their next sign-in, by scanning a fresh
// QR code after their AD password. Check it really is them before resetting:
// whoever signs in first with their password after this enrolls the phone.
//
// This edits data/hc-mfa.json directly (HC_MFA_FILE), write-then-rename, the
// way the portal does. It never reads or prints a secret.

import { appendFile, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

function resolve(configured, fallback) {
  const value = configured?.trim() || fallback;
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

const mfaFile = resolve(process.env.HC_MFA_FILE, "data/hc-mfa.json");
const logFile = resolve(process.env.HC_SECURITY_LOG_FILE, "data/hc-security-log.jsonl");

async function load() {
  try {
    // A byte-order mark is what Notepad and PowerShell 5.1 put in front of UTF-8.
    const parsed = JSON.parse((await readFile(mfaFile, "utf8")).replace(/^﻿/, ""));
    return { enrollments: parsed.enrollments ?? [] };
  } catch (error) {
    if (error?.code === "ENOENT") return { enrollments: [] };
    throw error;
  }
}

const [, , argument] = process.argv;

if (!argument) {
  console.error("Pakai: npm run mfa:reset -- <username>   atau   npm run mfa:reset -- --list");
  process.exit(2);
}

const file = await load();

if (argument === "--list") {
  if (file.enrollments.length === 0) {
    console.log("Belum ada yang mendaftarkan authenticator.");
  } else {
    for (const entry of file.enrollments) console.log(`${entry.userId}  terdaftar sejak ${entry.enrolledAt}`);
  }
  process.exit(0);
}

// The same normalisation as the portal: "CORP\ayu" and "ayu@corp" are "ayu".
const userId = argument.trim().split("\\").pop().split("@")[0].toLowerCase();
const remaining = file.enrollments.filter((entry) => entry.userId !== userId);

if (remaining.length === file.enrollments.length) {
  console.log(`${userId} tidak punya authenticator terdaftar. Tidak ada yang diubah.`);
  process.exit(0);
}

const tmp = `${mfaFile}.${randomUUID()}.tmp`;
await writeFile(tmp, `${JSON.stringify({ enrollments: remaining }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
await rename(tmp, mfaFile);

const event = { at: new Date().toISOString(), type: "mfa.reset", username: userId, detail: "direset lewat scripts/mfa-reset.mjs" };
await appendFile(logFile, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 }).catch(() => undefined);

console.log(`2FA milik ${userId} direset. Saat login berikutnya dia memindai kode QR baru dengan HP-nya.`);
