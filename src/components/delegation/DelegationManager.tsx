"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import { IconClock, IconSwap, IconUserCheck } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { postJson } from "@/lib/client/accountsApi";
import type { Delegation, DelegationState } from "@/lib/lifecycle/delegation";
import type { RerouteReport } from "@/lib/lifecycle/service";
import type { ActorIdentity } from "@/lib/lifecycle/types";
import { dateInputBounds } from "@/lib/validation/dates";

/**
 * Registering who answers for a manager while they are away.
 *
 * Both people are picked, never typed: the absent manager from the managers
 * requests are routed to, the substitute from active employees. The server
 * re-checks both, and refuses overlapping periods and chains.
 *
 * Moving requests that are already waiting is a separate, explicit tick. It
 * sends the substitute a fresh link and kills the one in the manager's inbox,
 * so it is something HC chooses to do, not a side effect of registering.
 */

export interface DelegationRow extends Delegation {
  state: DelegationState;
}

const STATE_LABEL: Record<DelegationState, { label: string; className: string }> = {
  ACTIVE: { label: "Berlaku", className: "border-ok/30 bg-ok/10 text-ok" },
  UPCOMING: { label: "Akan berlaku", className: "border-info/30 bg-info/10 text-info" },
  ENDED: { label: "Berakhir", className: "border-hairline bg-elevated/40 text-ink-faint" },
};

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(
    new Date(iso),
  );
}

function today(): string {
  // yyyy-MM-dd in Asia/Jakarta, which is what the server interprets dates in.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

export function DelegationManager({
  managers,
  substitutes,
  delegations,
  me,
}: {
  managers: ActorIdentity[];
  substitutes: ActorIdentity[];
  delegations: DelegationRow[];
  /** The signed-in officer, who may not appoint themselves. */
  me: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [values, setValues] = useState({
    fromEmail: "",
    toEmail: "",
    startDate: today(),
    endDate: "",
    reason: "",
  });
  const [reroutePending, setReroutePending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<RerouteReport | null>(null);

  const startsToday = values.startDate === today();
  const candidates = substitutes.filter(
    (person) => person.email !== values.fromEmail && person.email !== me,
  );

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setErrors({});
    setReport(null);

    const result = await postJson<{ delegation: Delegation; reroute?: RerouteReport }>(
      "/api/delegations",
      { ...values, reroutePending: reroutePending && startsToday },
    );

    setSaving(false);
    if (!result.ok) {
      setErrors(result.failure.fieldErrors ?? {});
      setError(result.failure.fieldErrors ? null : result.failure.message);
      return;
    }

    toast(
      `Delegasi ${result.data.delegation.from.name} → ${result.data.delegation.to.name} tercatat.`,
      "success",
    );
    if (result.data.reroute) setReport(result.data.reroute);
    setValues((current) => ({ ...current, fromEmail: "", toEmail: "", endDate: "", reason: "" }));
    setReroutePending(false);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <Card className="h-fit p-6">
        <form onSubmit={submit} noValidate className="space-y-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <IconSwap className="size-4 text-accent" />
            Daftarkan delegasi
          </h2>

          <FormAlert tone="error">{error}</FormAlert>

          <SelectField
            label="Manager yang berhalangan"
            name="fromEmail"
            icon={<IconUserCheck className="size-4" />}
            value={values.fromEmail}
            onChange={(event) => update("fromEmail", event.target.value)}
            error={errors.fromEmail}
            hint="Manager yang menjadi tujuan persetujuan tahap pertama."
          >
            <option value="">Pilih manager…</option>
            {managers.map((person) => (
              <option key={person.email} value={person.email}>
                {person.name} · {person.email}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Pengganti"
            name="toEmail"
            icon={<IconUserCheck className="size-4" />}
            value={values.toEmail}
            onChange={(event) => update("toEmail", event.target.value)}
            error={errors.toEmail}
            hint="Karyawan aktif di direktori. Anda tidak bisa menunjuk diri sendiri."
          >
            <option value="">Pilih pengganti…</option>
            {candidates.map((person) => (
              <option key={person.email} value={person.email}>
                {person.name} · {person.email}
              </option>
            ))}
          </SelectField>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Mulai"
              name="startDate"
              type="date"
              {...dateInputBounds({ pastDays: 0, futureDays: 365 })}
              icon={<IconClock className="size-4" />}
              value={values.startDate}
              onChange={(event) => update("startDate", event.target.value)}
              error={errors.startDate}
            />
            <Field
              label="Sampai"
              name="endDate"
              type="date"
              {...dateInputBounds({ pastDays: 0, futureDays: 365 })}
              icon={<IconClock className="size-4" />}
              value={values.endDate}
              onChange={(event) => update("endDate", event.target.value)}
              error={errors.endDate}
              hint="Paling lama 90 hari."
            />
          </div>

          <TextareaField
            label="Alasan"
            name="reason"
            rows={2}
            value={values.reason}
            onChange={(event) => update("reason", event.target.value)}
            error={errors.reason}
            placeholder="Cuti tahunan, dinas luar kota, …"
          />

          <label
            className={`flex items-start gap-2.5 rounded-lg border border-hairline px-3.5 py-3 text-xs leading-relaxed ${
              startsToday ? "text-ink-muted" : "text-ink-faint opacity-60"
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={reroutePending && startsToday}
              disabled={!startsToday}
              onChange={(event) => setReroutePending(event.target.checked)}
            />
            <span>
              <strong className="text-ink">Alihkan juga pengajuan yang sedang menunggu</strong>{" "}
              manager ini. Pengganti menerima email baru, dan tautan di email manager tidak berlaku
              lagi. {startsToday ? "" : "Hanya bisa bila delegasi mulai hari ini."}
            </span>
          </label>

          <Button type="submit" loading={saving} className="w-full">
            {saving ? "Menyimpan…" : "Daftarkan delegasi"}
          </Button>

          {report ? (
            <div className="space-y-1 rounded-lg border border-info/30 bg-info/10 px-3.5 py-2.5 text-xs text-info">
              <p>
                {report.rerouted.length} pengajuan dialihkan ke pengganti.
                {report.skipped.length > 0 ? ` ${report.skipped.length} tidak dialihkan:` : ""}
              </p>
              {report.skipped.map((skip) => (
                <p key={skip.requestId} className="font-mono break-all">
                  {skip.requestId} — {skip.reason}
                </p>
              ))}
            </div>
          ) : null}
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-ink">Daftar delegasi</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Persetujuan yang diberikan pengganti selalu tercatat &ldquo;atas nama&rdquo; manager yang
          berhalangan.
        </p>

        <ul className="mt-4 divide-y divide-hairline/60">
          {delegations.map((delegation) => (
            <DelegationItem key={delegation.id} delegation={delegation} />
          ))}
          {delegations.length === 0 ? (
            <li className="py-6 text-center text-sm text-ink-muted">Belum ada delegasi.</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}

function DelegationItem({ delegation }: { delegation: DelegationRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = STATE_LABEL[delegation.state];

  async function end() {
    setBusy(true);
    const result = await postJson(`/api/delegations/${delegation.id}/end`, {});
    setBusy(false);
    if (!result.ok) {
      toast(result.failure.message, "error");
      return;
    }
    toast("Delegasi diakhiri. Pengajuan baru kembali ke manager.", "info");
    router.refresh();
  }

  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${state.className}`}
        >
          {state.label}
        </span>
        <p className="text-sm font-medium text-ink">
          {delegation.from.name} <span className="text-ink-faint">→</span> {delegation.to.name}
        </p>
      </div>
      <p className="text-xs text-ink-muted">
        {formatDay(delegation.startsAt)} – {formatDay(delegation.endedAt ?? delegation.endsAt)}
        {delegation.endedAt ? " (diakhiri lebih awal)" : ""} · {delegation.reason}
      </p>
      <p className="text-[11px] text-ink-faint">
        Didaftarkan {delegation.createdBy.name}
        {delegation.endedBy ? ` · diakhiri ${delegation.endedBy.name}` : ""}
      </p>

      {delegation.state !== "ENDED" ? (
        confirming ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-xs text-ink-muted">Akhiri delegasi ini sekarang?</span>
            <Button variant="danger" size="sm" loading={busy} onClick={end}>
              Ya, akhiri
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              Tidak
            </Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Akhiri sekarang
          </Button>
        )
      ) : null}
    </li>
  );
}
