"use client";

import { motion } from "framer-motion";
import { useMemo, useState, useSyncExternalStore } from "react";

import { DirectoryView } from "@/components/dashboard/DirectoryView";
import { RequestCard } from "@/components/requests/RequestCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Field";
import { IconAlert } from "@/components/ui/Icons";
import { CreateUserForm } from "@/components/users/CreateUserForm";
import { DemoStore } from "@/lib/demo/demoStore";
import { TRANSITION_LAYOUT } from "@/lib/motion";
import type { JiraIssueRef } from "@/lib/types";

/**
 * The whole dashboard, running entirely in the browser for the static
 * GitHub Pages build. A Jira simulator replaces the webhook so visitors can
 * click the approval chain end to end.
 */

const TABS = [
  { id: "directory", label: "Directory" },
  { id: "add", label: "Add user" },
  { id: "approvals", label: "Approvals" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DemoApp() {
  // One store for the page's lifetime.
  const [store] = useState(() => new DemoStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [tab, setTab] = useState<TabId>("directory");
  const [log, setLog] = useState<string[]>([]);

  const activeTickets = useMemo(() => {
    const map: Record<string, JiraIssueRef | undefined> = {};
    for (const request of state.requests) {
      if (request.stage === "MANAGER_APPROVAL") map[request.employeeId] = request.managerIssue;
      else if (request.stage === "SECURITY_PROVISIONING")
        map[request.employeeId] = request.securityIssue;
    }
    return map;
  }, [state.requests]);

  const employeesById = useMemo(
    () => new Map(state.employees.map((employee) => [employee.id, employee])),
    [state.employees],
  );

  const openTickets = store.openTickets();

  function transition(issueKey: string, status: string, actor: string) {
    const message = store.applyTransition(issueKey, status, actor);
    setLog((current) => [`${issueKey} → ${status}: ${message}`, ...current].slice(0, 6));
  }

  return (
    <div className="space-y-6">
      <DemoBanner />

      <nav
        className="flex gap-1 rounded-xl border border-hairline bg-surface/60 p-1"
        aria-label="Demo sections"
      >
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              aria-current={selected ? "page" : undefined}
              className={`relative flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                selected ? "text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId="demo-tab"
                  transition={TRANSITION_LAYOUT}
                  className="absolute inset-0 rounded-lg bg-elevated"
                />
              ) : null}
              <span className="relative">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <JiraSimulator openTickets={openTickets} log={log} onTransition={transition} />

      {tab === "directory" ? (
        <DirectoryView
          employees={state.employees}
          activeTickets={activeTickets}
          dataSource={store}
          // The store notifies its own subscribers, so there is nothing for the
          // components to refresh by hand.
          onChanged={() => undefined}
        />
      ) : null}

      {tab === "add" ? (
        <CreateUserForm
          dataSource={store}
          onCreated={() => undefined}
          onTrack={() => setTab("approvals")}
        />
      ) : null}

      {tab === "approvals" ? (
        state.requests.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-sm text-ink-muted">
              No onboarding requests yet — add a user to start the workflow.
            </p>
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setTab("add")}>Add user</Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-5">
            {state.requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                employee={employeesById.get(request.employeeId)}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-warn">
        <IconAlert className="size-4" />
        Static demo — no backend
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        This page is a GitHub Pages export, so the API routes and the real Jira integration are not
        running. Tickets are generated locally and the panel below stands in for the Jira webhook.
        Everything resets on refresh. The full application, including{" "}
        <code className="font-mono text-ink">POST /api/webhooks/jira</code>, needs a Node host — see
        the README.
      </p>
    </div>
  );
}

interface JiraSimulatorProps {
  openTickets: Array<{ issue: JiraIssueRef; employeeName: string; stage: string }>;
  log: string[];
  onTransition: (issueKey: string, status: string, actor: string) => void;
}

/** Stands in for a manager or IT Security moving a ticket in Jira. */
function JiraSimulator({ openTickets, log, onTransition }: JiraSimulatorProps) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Jira simulator</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Moves a ticket the way the real webhook would, so you can walk the approval chain.
      </p>

      {openTickets.length === 0 ? (
        <p className="mt-4 text-xs text-ink-faint">
          No open tickets. Add a user to raise a manager approval ticket.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {openTickets.map(({ issue, employeeName, stage }) => {
            const isManagerStep = stage === "Manager approval";
            return (
              <li
                key={issue.key}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline-strong bg-elevated px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-sm text-accent-soft">{issue.key}</span>
                  <span className="block text-xs text-ink-faint">
                    {employeeName} · {stage}
                  </span>
                </span>
                <span className="ml-auto flex gap-2">
                  {isManagerStep ? (
                    <>
                      <Button onClick={() => onTransition(issue.key, "Approved", "Sarah Wijaya")}>
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => onTransition(issue.key, "Rejected", "Sarah Wijaya")}
                      >
                        Reject
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => onTransition(issue.key, "Done", "Bagus Nugroho")}>
                      Close as Done
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {log.length > 0 ? (
        <ul className="mt-4 space-y-1 border-t border-hairline pt-3">
          {log.map((line, index) => (
            <li key={index} className="font-mono text-xs text-ink-faint">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
