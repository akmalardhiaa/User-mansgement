import { Card } from "@/components/ui/Field";
import { StageBadge, StatusBadge } from "@/components/ui/StatusBadge";
import type { Employee, JiraIssueRef, OnboardingRequest } from "@/lib/types";

type StepState = "done" | "current" | "todo" | "failed";

interface Step {
  title: string;
  detail: string;
  state: StepState;
  issue?: JiraIssueRef;
}

/** Maps a request's stage onto the four visible workflow steps. */
function buildSteps(request: OnboardingRequest): Step[] {
  const { stage } = request;
  const rejected = stage === "REJECTED";
  const pastManager = stage === "SECURITY_PROVISIONING" || stage === "COMPLETED";

  return [
    {
      title: "Request submitted",
      detail: "HC captured the new joiner's details.",
      state: "done",
    },
    {
      title: "Manager approval",
      detail: rejected
        ? "The manager rejected this request."
        : pastManager
          ? "Approved by the reporting manager."
          : "Waiting for the manager to transition the ticket in Jira.",
      state: rejected ? "failed" : pastManager ? "done" : "current",
      issue: request.managerIssue,
    },
    {
      title: "IT Security provisioning",
      detail:
        stage === "COMPLETED"
          ? "Accounts and access were provisioned."
          : stage === "SECURITY_PROVISIONING"
            ? "Waiting for IT Security to close the provisioning ticket."
            : "Raised automatically once the manager approves.",
      state:
        stage === "COMPLETED" ? "done" : stage === "SECURITY_PROVISIONING" ? "current" : "todo",
      issue: request.securityIssue,
    },
    {
      title: "Account active",
      detail:
        stage === "COMPLETED"
          ? "The employee is active in the HC dashboard."
          : "Set automatically when the provisioning ticket closes.",
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
      className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${STEP_MARKER[state]}`}
      aria-hidden
    >
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
      className="font-mono text-xs text-accent-soft hover:underline"
    >
      {issue.key}
      {issue.status ? <span className="text-ink-faint"> · {issue.status}</span> : null} ↗
    </a>
  );
}

interface RequestCardProps {
  request: OnboardingRequest;
  employee?: Employee;
}

export function RequestCard({ request, employee }: RequestCardProps) {
  const steps = buildSteps(request);

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-hairline p-5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{employee?.name ?? "Unknown employee"}</h2>
          <p className="truncate text-xs text-ink-faint">
            {employee ? `${employee.jobTitle} · ${employee.department}` : request.employeeId}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <StageBadge stage={request.stage} />
          {employee ? <StatusBadge status={employee.status} /> : null}
        </div>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepMarker state={step.state} index={index} />
                {index < steps.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-hairline-strong" aria-hidden />
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
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-hairline bg-canvas/40 p-4">
          <h3 className="text-xs tracking-wide text-ink-faint uppercase">Activity</h3>
          <ul className="mt-3 space-y-3">
            {[...request.events].reverse().map((event, index) => (
              <li key={`${event.at}-${index}`} className="text-xs">
                <p className="text-ink-muted">{event.message}</p>
                <p className="mt-0.5 text-ink-faint">
                  <time dateTime={event.at}>{new Date(event.at).toLocaleString("en-GB")}</time>
                  {event.actor ? ` · ${event.actor}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
