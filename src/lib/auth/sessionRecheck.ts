import { clearInterval, setInterval, setTimeout } from "node:timers";

import { AdConfigurationError } from "@/lib/ad/configError";
import { ldapConnector, readLdapAdConfig, type LdapClientLike } from "@/lib/ad/ldapConnection";
import { isEnabled, parseUserAccountControl, stringList } from "@/lib/ad/ldapEntry";
import { accountNameFilter } from "@/lib/ad/ldapFilter";
import { processShared } from "@/lib/db/processShared";

import { isLdapLoginConfigured } from "./ldapLoginConfig";
import { rolesFromGroups } from "./roleMapping";
import { recordSecurityEvent } from "./securityLog";
import { liveSessionUsers, revokeSessionsForUser, sameRoles } from "./session";

/**
 * Asking AD, every few minutes, whether the people signed in still should be.
 *
 * A session used to last its full eight hours whatever happened in the
 * directory: an HC officer disabled at noon, or taken out of the HC group,
 * kept working in the portal until the evening. Now every SESSION_RECHECK
 * minutes each signed-in account is read with the service account, and its
 * sessions end when the account is gone, disabled, or its portal roles have
 * changed (signing in again picks up the new ones).
 *
 * When AD cannot be reached the sessions are left alone and the run is logged.
 * Throwing everybody out because a domain controller restarted would teach the
 * team to resent the check; the next run looks again.
 */

export interface RecheckReport {
  checked: number;
  revoked: Array<{ username: string; reason: string }>;
  /** Set when the directory could not be read; nothing was revoked. */
  error?: string;
}

const DEFAULT_MINUTES = 5;

export function resolveRecheckMinutes(raw: string | undefined): number | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return DEFAULT_MINUTES;
  if (value === "0" || value === "off") return undefined;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error(`SESSION_RECHECK_MINUTES="${raw}" bukan bilangan bulat menit. Isi 0 untuk mematikan.`);
  }
  return minutes;
}

export async function recheckSessions({
  connect,
  baseDn,
}: {
  connect: () => Promise<LdapClientLike>;
  baseDn: string;
}): Promise<RecheckReport> {
  const users = await liveSessionUsers();
  const report: RecheckReport = { checked: users.length, revoked: [] };
  if (users.length === 0) return report;

  const verdicts: Array<{ userId: string; username: string; reason: string }> = [];
  let client: LdapClientLike | undefined;
  try {
    client = await connect();
    for (const user of users) {
      const [entry] = await client.search(baseDn, {
        scope: "sub",
        filter: accountNameFilter(user.userId),
        attributes: ["userAccountControl", "memberOf"],
        sizeLimit: 2,
      });
      if (!entry) {
        verdicts.push({ ...user, reason: "akun tidak ada lagi di AD" });
      } else if (!isEnabled(parseUserAccountControl(entry.userAccountControl))) {
        verdicts.push({ ...user, reason: "akun dinonaktifkan di AD" });
      } else if (!sameRoles(rolesFromGroups(stringList(entry.memberOf)), user.roles)) {
        verdicts.push({ ...user, reason: "keanggotaan group portal berubah" });
      }
    }
  } catch (error) {
    // Nothing is revoked on a partial read: a verdict reached before the
    // failure is still sound, but acting on half a run makes the outcome
    // depend on where the directory happened to stop answering.
    return { ...report, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client?.close().catch(() => undefined);
  }

  for (const verdict of verdicts) {
    const count = await revokeSessionsForUser(verdict.userId, `ad-recheck: ${verdict.reason}`);
    if (count === 0) continue;
    report.revoked.push({ username: verdict.username, reason: verdict.reason });
    await recordSecurityEvent({ type: "session.revoked", username: verdict.username, detail: verdict.reason });
  }
  return report;
}

const state = processShared("session-recheck", () => ({ started: false, running: false }));

export function startSessionRecheckFromEnv(): void {
  if (state.started) return;
  state.started = true;

  // Demo sign-ins have no directory to ask.
  if (!isLdapLoginConfigured()) return;

  let minutes: number | undefined;
  try {
    minutes = resolveRecheckMinutes(process.env.SESSION_RECHECK_MINUTES);
  } catch (error) {
    console.error("[session-recheck]", error);
    return;
  }
  if (minutes === undefined) return;

  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const config = readLdapAdConfig();
      const report = await recheckSessions({ connect: ldapConnector(config), baseDn: config.baseDn });
      if (report.error) {
        console.warn(`[session-recheck] AD tidak terbaca, sesi dibiarkan sampai putaran berikutnya: ${report.error}`);
      }
      for (const revoked of report.revoked) {
        console.log(`[session-recheck] sesi ${revoked.username} diakhiri: ${revoked.reason}`);
      }
    } catch (error) {
      if (error instanceof AdConfigurationError) {
        // Without the service account there is nothing to recheck with; say it
        // once rather than every few minutes.
        console.warn(`[session-recheck] tidak aktif: ${error.message}`);
        clearInterval(timer);
        return;
      }
      console.error("[session-recheck] satu putaran gagal; dicoba lagi nanti.", error);
    } finally {
      state.running = false;
    }
  };

  const timer = setInterval(() => void tick(), minutes * 60_000);
  timer.unref();
  setTimeout(() => void tick(), 60_000).unref();
  console.log(`[session-recheck] aktif, mencocokkan sesi dengan AD tiap ${minutes} menit.`);
}
