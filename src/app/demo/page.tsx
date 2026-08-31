import { DemoApp } from "@/components/demo/DemoApp";

export const metadata = { title: "Demo · HC User Management" };

/**
 * Entry point for the static GitHub Pages build. The deploy workflow promotes
 * this to the site root after removing the server-only routes.
 */
export default function DemoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">HC User Management</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Employee directory and Jira-driven onboarding approvals.
        </p>
      </div>
      <DemoApp />
    </div>
  );
}
