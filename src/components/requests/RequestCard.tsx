"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { Card } from "@/components/ui/Field";
import {
  IconChevron,
  IconClock,
  IconExternal,
  IconNote,
  IconSwap,
  IconUserPlus,
} from "@/components/ui/Icons";
import { StageBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { TRANSITION, TRANSITION_FAST, collapse } from "@/lib/motion";
import type { Employee, JiraIssueRef, AccessRequest } from "@/lib/types";

type StepState = "done" | "current" | "todo" | "failed";

interface Step {
  title: string;
  detail: string;
  state: StepState;
  issue?: JiraIssueRef;
}

/** Wording for each step, which differs between adding and removing an account. */
const STEP_COPY = {
  ONBOARDING: {
    submitted: "HC mencatat data karyawan baru.",
    securityTitle: "Penyiapan akses IT Security",
    securityDone: "Akun dan akses sudah disiapkan.",
    securityWaiting: "Menunggu IT Security menutup tiket penyiapan akses.",
    securityPending: "Dibuat otomatis setelah manager menyetujui.",
    finalTitle: "Akun aktif",
    finalDone: "Karyawan sudah aktif di dashboard HC.",
    finalPending: "Diubah otomatis saat tiket penyiapan ditutup.",
  },
  TRANSFER: {
    submitted: "HC mengajukan pemindahan divisi karyawan ini.",
    securityTitle: "Penyesuaian akses IT Security",
    securityDone: "Akses sudah disesuaikan dengan divisi baru.",
    securityWaiting: "Menunggu IT Security menutup tiket penyesuaian akses.",
    securityPending: "Dibuat otomatis setelah manager menyetujui.",
    finalTitle: "Posisi diperbarui",
    finalDone: "Divisi dan jabatan baru sudah berlaku di dashboard HC.",
    finalPending: "Diterapkan otomatis saat tiket penyesuaian ditutup.",
  },
} as const;

/** Maps a request's stage onto the four visible workflow steps. */
function buildSteps(request: AccessRequest): Step[] {
  const { stage } = request;
  const copy = STEP_COPY[request.type];
  const rejected = stage === "REJECTED";
  const pastManager = stage === "SECURITY_PROVISIONING" || stage === "COMPLETED";

  return [
    {
      title: "Pengajuan dikirim",
      detail: copy.submitted,
      state: "done",
    },
    {
      title: "Persetujuan manager",
      detail: rejected
        ? request.type === "TRANSFER"
          ? "Manager menolak pemindahan; karyawan tetap di posisi semula."
          : "Manager menolak pengajuan ini."
        : pastManager
          ? "Disetujui oleh manager."
          : "Menunggu manager memindahkan status tiket di Jira.",
      state: rejected ? "failed" : pastManager ? "done" : "current",
      issue: request.managerIssue,
    },
    {
      title: copy.securityTitle,
      detail:
        stage === "COMPLETED"
          ? copy.securityDone
          : stage === "SECURITY_PROVISIONING"
            ? copy.securityWaiting
            : copy.securityPending,
      state:
        stage === "COMPLETED" ? "done" : stage === "SECURITY_PROVISIONING" ? "current" : "todo",
      issue: request.securityIssue,
    },
    {
      title: copy.finalTitle,
      detail: stage === "COMPLETED" ? copy.finalDone : copy.finalPending,
      state: stage === "COMPLETED" ? "done" : "todo",
    },
  ];
}

const STEP_MARKER: Record<StepState, string> = {
  done: "border-ok/40 bg-ok/15 text-ok",
  current: "border-warn/40 bg-warn/15 text-warn",
  failed: "border-danger/40 bg-danger/15 text-danger",
  todo: "border-hairline-strong bg-elevated text-ink-faint",
};

function StepMarker({ state, index }: { state: StepState; index: number }) {
  const glyph = state === "done" ? "✓" : state === "failed" ? "✕" : String(index + 1);
  return (
    <span
      className={`relative grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${STEP_MARKER[state]}`}
      aria-hidden
    >
      {/* The step someone is actually waiting on is the only thing on the card
          that moves, so the eye lands on it without reading anything. */}
      {state === "current" ? (
        <motion.span
          className="absolute inset-0 rounded-full border border-warn/60"
          animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      ) : null}
      {glyph}
    </span>
  );
}

function IssueLink({ issue }: { issue: JiraIssueRef }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-accent-soft hover:underline"
    >
      {issue.key}
      {issue.status ? <span className="text-ink-faint"> · {issue.status}</span> : null}
      <IconExternal className="size-3" />
    </a>
  );
}

/** How far along the four steps the request has actually got, as a fraction. */
function progressOf(steps: Step[]): number {
  const done = steps.filter((step) => step.state === "done").length;
  return done / steps.length;
}

const VISIBLE_EVENTS = 3;

interface RequestCardProps {
  request: AccessRequest;
  employee?: Employee;
}

export function RequestCard({ request, employee }: RequestCardProps) {
  const steps = buildSteps(request);
  const [showAll, setShowAll] = useState(false);

  // Newest first: the audit trail is read to find out what just happened.
  const events = [...request.events].reverse();
  const shown = showAll ? events : events.slice(0, VISIBLE_EVENTS);
  const hidden = events.length - shown.length;

  const rejected = request.stage === "REJECTED";
  const progress = rejected ? 1 : progressOf(steps);

  return (
    <Card className="overflow-hidden" interactive>
      {/* The bar is the card's whole status in one glance, before any reading. */}
      <div className="h-0.5 w-full bg-elevated">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progress }}
          transition={TRANSITION}
          style={{ transformOrigin: "left" }}
          className={`h-full ${
            rejected ? "bg-danger" : request.stage === "COMPLETED" ? "bg-ok" : "bg-accent"
          }`}
        />
      </div>

      <header className="flex flex-wrap items-center gap-3 border-b border-hairline p-5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">
            {employee?.displayName ?? "Karyawan tidak dikenal"}
          </h2>
          <p className="truncate text-xs text-ink-faint">
            {employee ? `${employee.jobTitle} · ${employee.department}` : request.employeeId}
          </p>
          {request.transfer ? (
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-info">
              {/* Replaces a bare arrow: the same glyph the type badge and the
                  directory's own "Ubah posisi" button use for a move. */}
              <IconSwap className="size-3.5 shrink-0" />
              {request.transfer.department} · {request.transfer.jobTitle}
              {request.transfer.managerName ? ` · manager ${request.transfer.managerName}` : ""}
            </p>
          ) : null}
          {request.reason ? (
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-ink-muted">
              <IconNote className="size-3.5 shrink-0" />
              {request.reason}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
              request.type === "TRANSFER"
                ? "border-info/30 bg-info/10 text-info"
                : "border-accent/30 bg-accent/10 text-accent-soft"
            }`}
          >
            {request.type === "TRANSFER" ? (
              <IconSwap className="size-3.5" />
            ) : (
              <IconUserPlus className="size-3.5" />
            )}
            {request.type === "TRANSFER" ? "Pindah divisi" : "Akun baru"}
          </span>
          <StageBadge stage={request.stage} type={request.type} />
          {employee ? <StatusBadge status={employee.status} /> : null}
        </div>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...TRANSITION, delay: index * 0.06 }}
              className="flex gap-3"
            >
              <div className="flex flex-col items-center">
                <StepMarker state={step.state} index={index} />
                {index < steps.length - 1 ? (
                  <span
                    className={`mt-1 w-px flex-1 ${
                      step.state === "done" ? "bg-ok/40" : "bg-hairline-strong"
                    }`}
                    aria-hidden
                  />
                ) : null}
              </div>
              <div className="pb-1">
                <p className="text-sm font-medium text-ink">{step.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{step.detail}</p>
                {step.issue ? (
                  <p className="mt-1">
                    <IssueLink issue={step.issue} />
                  </p>
                ) : null}
              </div>
            </motion.li>
          ))}
        </ol>

        <div className="rounded-xl border border-hairline bg-canvas/40 p-4">
          <h3 className="flex items-center gap-1.5 text-xs tracking-wide text-ink-faint uppercase">
            <IconClock className="size-3.5" />
            Aktivitas
          </h3>

          <ul className="mt-3 space-y-3">
            {shown.map((event, index) => (
              <li key={`${event.at}-${index}`} className="text-xs">
                <p className="text-ink-muted">{event.message}</p>
                <p className="mt-0.5 text-ink-faint">
                  <time dateTime={event.at}>{new Date(event.at).toLocaleString("id-ID")}</time>
                  {event.actor ? ` · ${event.actor}` : ""}
                </p>
              </li>
            ))}
          </ul>

          {/*
           * A long-running request accumulates a dozen webhook events, and the
           * audit trail was pushing the workflow steps off the screen. The three
           * most recent answer "what just happened"; the rest is one click away.
           */}
          <AnimatePresence initial={false}>
            {hidden > 0 ? (
              <motion.button
                key="more"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={TRANSITION_FAST}
                onClick={() => setShowAll(true)}
                aria-expanded={false}
                className="mt-3 inline-flex items-center gap-1 text-xs text-ink-faint transition-colors hover:text-ink"
              >
                <IconChevron className="size-3" />
                {hidden} aktivitas lainnya
              </motion.button>
            ) : null}
          </AnimatePresence>

          {showAll && events.length > VISIBLE_EVENTS ? (
            <motion.button
              type="button"
              variants={collapse}
              initial="hidden"
              animate="visible"
              onClick={() => setShowAll(false)}
              aria-expanded
              className="mt-3 inline-flex items-center gap-1 overflow-hidden text-xs text-ink-faint transition-colors hover:text-ink"
            >
              <IconChevron className="size-3 rotate-180" />
              Ringkas
            </motion.button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
