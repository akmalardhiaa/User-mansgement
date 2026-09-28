import { getAdDriver } from "@/lib/ad";

import { RoutingError, resolveCisoTeam } from "./routing";
import type { ActorIdentity } from "./types";

/**
 * Who is on the CISO team, at the moment a request is submitted.
 *
 * Three sources, in order:
 *
 *   1. `CISO_APPROVER_GROUP` — a directory group. Its enabled members with a
 *      mailbox are the team, read fresh at every submit, so joining or leaving
 *      the team is a change made in Active Directory by the people who own it.
 *   2. `CISO_APPROVER_EMAILS` — a fixed list in configuration.
 *   3. `CISO_APPROVER_EMAIL` — one approver, a team of one.
 *
 * `CISO_EXCLUDE_EMAILS` is applied to whichever source is used. It exists for
 * the head of the function: often a member of the team's own directory group,
 * and by the company's rule a supervisor who is never asked to approve.
 *
 * Kept apart from routing.ts because it reads the directory; routing.ts stays
 * pure and safe to import anywhere.
 *
 * A group that cannot be read fails the submit. Falling back to the configured
 * list would silently ask a different set of people than the one the company
 * designated — the one outcome worse than not asking at all.
 */
export async function resolveCisoTeamForSubmit(): Promise<ActorIdentity[]> {
  const group = process.env.CISO_APPROVER_GROUP?.trim();
  const team = group ? await teamFromDirectory(group) : resolveCisoTeam();

  const excluded = new Set(
    (process.env.CISO_EXCLUDE_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  const eligible = team.filter((member) => !excluded.has(member.email.toLowerCase()));

  if (eligible.length === 0) {
    throw new RoutingError(
      "Tidak ada anggota tim CISO yang bisa dikirimi permintaan persetujuan setelah pengecualian diterapkan.",
    );
  }
  return eligible;
}

async function teamFromDirectory(group: string): Promise<ActorIdentity[]> {
  let members;
  try {
    members = await getAdDriver().listGroupMembers(group);
  } catch (error) {
    throw new RoutingError(
      `Anggota tim CISO tidak bisa dibaca dari direktori (${group}): ${
        error instanceof Error ? error.message : String(error)
      }. Pengajuan tidak dikirim.`,
    );
  }

  // A disabled account cannot answer, and one with no mailbox cannot be asked.
  const team = members
    .filter((member) => member.enabled && member.mail?.trim())
    .map((member) => ({
      name: member.displayName || member.mail,
      email: member.mail.trim().toLowerCase(),
    }));

  if (team.length === 0) {
    throw new RoutingError(
      `Group ${group} tidak memiliki anggota aktif yang punya email. Pengajuan tidak dapat dirutekan ke tim CISO.`,
    );
  }
  return team;
}
