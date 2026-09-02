"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import { RequestCard } from "@/components/requests/RequestCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Field";
import { IconSearch } from "@/components/ui/Icons";
import { TRANSITION_LAYOUT, stagger, staggerItem } from "@/lib/motion";
import type { AccessRequest, Employee, RequestStage } from "@/lib/types";

/**
 * The approvals list, with a way to narrow it.
 *
 * The page rendered every request ever raised, newest buried among the closed
 * ones, which made the most common question — "what is still waiting on
 * someone?" — the hardest one to answer. The filter defaults to open requests
 * for that reason; the counts sit on the tabs so the shape of the queue is
 * visible before anything is clicked.
 */

type Filter = "OPEN" | RequestStage | "ALL";

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "OPEN", label: "Berjalan" },
  { id: "MANAGER_APPROVAL", label: "Menunggu manager" },
  { id: "SECURITY_PROVISIONING", label: "IT Security" },
  { id: "COMPLETED", label: "Selesai" },
  { id: "REJECTED", label: "Ditolak" },
  { id: "ALL", label: "Semua" },
];

function matches(request: AccessRequest, filter: Filter): boolean {
  if (filter === "ALL") return true;
  if (filter === "OPEN") {
    return request.stage === "MANAGER_APPROVAL" || request.stage === "SECURITY_PROVISIONING";
  }
  return request.stage === filter;
}

export function RequestsBoard({
  requests,
  employees,
}: {
  requests: AccessRequest[];
  employees: Employee[];
}) {
  const [filter, setFilter] = useState<Filter>("OPEN");

  const byId = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const counts = useMemo(() => {
    const result = {} as Record<Filter, number>;
    for (const { id } of FILTERS) {
      result[id] = requests.filter((request) => matches(request, id)).length;
    }
    return result;
  }, [requests]);

  const visible = useMemo(() => {
    return requests
      .filter((request) => matches(request, filter))
      // Most recently touched first — an approvals queue is read from the top.
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [requests, filter]);

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Saring pengajuan"
        className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface/60 p-1"
      >
        {FILTERS.map((item) => {
          const selected = filter === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(item.id)}
              className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                selected ? "text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId="request-filter"
                  transition={TRANSITION_LAYOUT}
                  className="absolute inset-0 rounded-lg border border-hairline-strong bg-elevated"
                />
              ) : null}
              <span className="relative flex items-center gap-1.5">
                {item.label}
                <span
                  className={`tnum rounded px-1.5 py-0.5 text-[11px] ${
                    selected ? "bg-accent/15 text-accent-soft" : "bg-elevated/70 text-ink-faint"
                  }`}
                >
                  {counts[item.id]}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <Card className="p-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full border border-hairline bg-elevated/60 text-ink-faint">
            <IconSearch className="size-5" />
          </span>
          <p className="mt-3 text-sm text-ink-muted">Tidak ada pengajuan pada saringan ini.</p>
          {filter !== "ALL" ? (
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => setFilter("ALL")}>
              Lihat semua pengajuan
            </Button>
          ) : null}
        </Card>
      ) : (
        <motion.div
          // Re-keyed per filter so switching tabs replays the stagger rather
          // than swapping the contents of a static list.
          key={filter}
          variants={stagger()}
          initial="hidden"
          animate="visible"
          className="space-y-5"
        >
          <AnimatePresence initial={false}>
            {visible.map((request) => (
              <motion.div key={request.id} variants={staggerItem} exit={{ opacity: 0 }}>
                <RequestCard request={request} employee={byId.get(request.employeeId)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
