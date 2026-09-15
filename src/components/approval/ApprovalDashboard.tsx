"use client";

import type { ApprovalStatus } from "@prisma/client";
import { Fragment, useCallback, useEffect, useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { STATUS_META, StatusPill, WorkflowDots, WorkflowProgress } from "@/components/approval/WorkflowProgress";
import { Button } from "@/components/ui/Button";
import { Card, Field } from "@/components/ui/Field";
import { IconSearch, IconSync } from "@/components/ui/Icons";
import type { ApprovalView } from "@/lib/approval/service";
import { getJson } from "@/lib/client/accountsApi";

interface ListData {
  requests: ApprovalView[];
  total: number;
  counts: Partial<Record<ApprovalStatus, number>>;
}

interface Detail extends ApprovalView {
  logs: Array<{ id: string; action: string; actionBy: string; details: string | null; timestamp: string }>;
}

const FILTERS: Array<{ value: "" | ApprovalStatus; label: string }> = [
  { value: "", label: "Semua" },
  { value: "PENDING", label: STATUS_META.PENDING.label },
  { value: "MANAGER_APPROVED", label: STATUS_META.MANAGER_APPROVED.label },
  { value: "ACTIVE", label: STATUS_META.ACTIVE.label },
  { value: "MANAGER_REJECTED", label: STATUS_META.MANAGER_REJECTED.label },
  { value: "IT_REJECTED", label: STATUS_META.IT_REJECTED.label },
];

const ACTION_LABEL: Record<string, string> = {
  REQUEST_CREATED: "Pengajuan dibuat",
  MANAGER_NOTIFIED: "Email ke manager terkirim",
  MANAGER_APPROVED: "Manager menyetujui",
  MANAGER_REJECTED: "Manager menolak",
  CISO_NOTIFIED: "Email ke CISO terkirim",
  CISO_NOTIFY_FAILED: "Email ke CISO gagal",
  IT_APPROVED: "IT Security menyetujui",
  IT_REJECTED: "IT Security menolak",
  ACCOUNT_ACTIVATED: "Akun diaktifkan",
  USER_NOTIFIED: "Email aktivasi terkirim ke user",
  USER_NOTIFY_FAILED: "Email aktivasi gagal",
  REQUESTER_NOTIFIED: "Email penolakan terkirim ke HC",
  REQUESTER_NOTIFY_FAILED: "Email penolakan gagal",
};

function date(value: string): string {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/** Admin view of every approval request, filterable by status, with each request's audit trail. */
export function ApprovalDashboard() {
  const [status, setStatus] = useState<"" | ApprovalStatus>("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    const result = await getJson<ListData>(`/api/approvals?${params.toString()}`);
    if (result.ok) setData(result.data);
    else setError(result.failure.message);
    setLoading(false);
  }, [status, query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    const result = await getJson<Detail>(`/api/approvals/${id}`);
    if (result.ok) setDetail(result.data);
  }

  const allCount = data ? Object.values(data.counts).reduce((sum, n) => sum + (n ?? 0), 0) : 0;

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter status">
          {FILTERS.map((filter) => {
            const active = status === filter.value;
            const count = filter.value ? (data?.counts[filter.value] ?? 0) : allCount;
            return (
              <button
                key={filter.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(filter.value)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "border-accent bg-accent/15 text-ink" : "border-hairline text-ink-muted hover:border-hairline-strong hover:text-ink"
                }`}
              >
                {filter.label}
                <span className="rounded-full bg-elevated px-1.5 py-0.5 font-mono text-[11px] tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Cari"
            name="approvalSearch"
            type="search"
            icon={<IconSearch className="size-4" />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nama, email, atau departemen…"
            className="min-w-0 flex-1"
          />
          <Button variant="secondary" icon={<IconSync className="size-4" />} loading={loading} onClick={() => void load()}>
            Muat ulang
          </Button>
        </div>
      </Card>

      <FormAlert tone="error">{error}</FormAlert>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs tracking-wide text-ink-muted uppercase">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Departemen</th>
                <th className="px-4 py-3 font-semibold">Penyetuju</th>
                <th className="px-4 py-3 font-semibold">Progres</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Diajukan</th>
              </tr>
            </thead>
            <tbody>
              {data?.requests.map((request) => (
                <Fragment key={request.id}>
                  <tr
                    onClick={() => void toggle(request.id)}
                    className={`cursor-pointer border-b border-hairline/60 hover:bg-elevated/40 ${openId === request.id ? "bg-elevated/40" : ""}`}
                    aria-expanded={openId === request.id}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{request.employee.fullName}</p>
                      <p className="font-mono text-xs text-ink-muted">{request.employee.email}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{request.employee.department}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      <p>M: {request.managerName}</p>
                      <p>C: {request.cisoName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <WorkflowDots {...request} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={request.status} />
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-ink-muted tabular-nums">{date(request.createdAt)}</td>
                  </tr>
                  {openId === request.id ? (
                    <tr className="border-b border-hairline bg-canvas/40">
                      <td colSpan={6} className="px-4 py-5">
                        <div className="space-y-5">
                          <WorkflowProgress {...request} />
                          {request.rejectionReason ? (
                            <FormAlert tone="error">
                              <p className="font-medium">Ditolak oleh {request.rejectedBy}</p>
                              <p className="opacity-90">{request.rejectionReason}</p>
                            </FormAlert>
                          ) : null}
                          <div>
                            <p className="mb-2 text-xs font-semibold tracking-[0.1em] text-ink-muted uppercase">Jejak audit</p>
                            {detail ? (
                              <ol className="space-y-2">
                                {detail.logs.map((entry) => (
                                  <li key={entry.id} className="grid gap-1 text-sm sm:grid-cols-[11rem_1fr]">
                                    <span className="text-xs text-ink-faint tabular-nums">{date(entry.timestamp)}</span>
                                    <span className="text-ink">
                                      <span className="font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</span>
                                      <span className="text-ink-muted"> · {entry.actionBy}</span>
                                      {entry.details ? <span className="block text-xs text-ink-muted">{entry.details}</span> : null}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="text-sm text-ink-muted">Memuat jejak audit…</p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && data && data.requests.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">Belum ada pengajuan dengan filter ini.</p>
        ) : null}
      </Card>
    </div>
  );
}
