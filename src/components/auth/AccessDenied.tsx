"use client";

import Link from "next/link";

import { useT } from "@/components/i18n/LocaleProvider";
import { Card } from "@/components/ui/Field";
import type { PortalRole } from "@/lib/auth/roles";



/**
 * Shown to somebody who is signed in but whose roles do not cover this page.
 *
 * A refusal that explains itself, rather than an empty screen or a redirect
 * that looks like a bug. Being in Active Directory does not confer authority
 * here, and the person hitting this wall has no way to know that unless the
 * page says so and names who can fix it.
 */
export function AccessDenied({ roles, need }: { roles: PortalRole[]; need: string }) {
  const t = useT();
  const roleLabel: Record<PortalRole, string> = {
    HC_REQUESTER: t.accessDenied.roleHc,
    SYSTEM_ADMIN: t.accessDenied.roleAdmin,
    OPS_OPERATOR: t.accessDenied.roleOps,
    AUDITOR: t.accessDenied.roleAuditor,
  };

  return (
    <Card className="p-8">
      <h1 className="text-lg font-semibold text-ink">{t.accessDenied.title}</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-muted">
        {t.accessDenied.body}
      </p>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-3">
          <dt className="text-ink-muted">{t.accessDenied.required}</dt>
          <dd className="font-medium text-ink">{need}</dd>
        </div>
        <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-3">
          <dt className="text-ink-muted">{t.accessDenied.yourRoles}</dt>
          <dd className="font-medium text-ink">
            {roles.length > 0
              ? roles.map((role) => roleLabel[role] ?? role).join(", ")
              : t.accessDenied.noRole}
          </dd>
        </div>
      </dl>

      <p className="mt-5 max-w-prose text-xs text-ink-faint">
        {t.accessDenied.hint}
      </p>

      <Link
        href="/profile"
        className="mt-6 inline-flex text-sm text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
      >
        {t.accessDenied.viewProfile}
      </Link>
    </Card>
  );
}
