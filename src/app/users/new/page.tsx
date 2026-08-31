import Link from "next/link";

import { CreateUserForm } from "@/components/users/CreateUserForm";

export const metadata = { title: "Add user · HC User Management" };

const WORKFLOW = [
  ["1", "HC submits", "The joiner is saved as Awaiting manager — no account is created."],
  ["2", "Manager approves", "A Jira ticket is assigned to the reporting manager."],
  ["3", "IT Security provisions", "Approval automatically raises a provisioning ticket."],
  ["4", "Account activates", "Closing the provisioning ticket flips the status to Active."],
] as const;

export default function NewUserPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-ink-muted hover:text-ink">
          ← Back to directory
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add a new user</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The request goes through manager approval and IT Security provisioning before the account
          becomes active.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <CreateUserForm />

        <aside className="rounded-2xl border border-hairline bg-surface/60 p-5">
          <h2 className="text-xs tracking-wide text-ink-faint uppercase">What happens next</h2>
          <ol className="mt-4 space-y-4">
            {WORKFLOW.map(([step, title, detail]) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-hairline-strong bg-elevated text-[11px] font-semibold text-ink-muted">
                  {step}
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">{title}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
