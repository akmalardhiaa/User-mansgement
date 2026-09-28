"use client";

import { useRouter } from "next/navigation";

import { useT } from "@/components/i18n/LocaleProvider";

import { MovementForm } from "@/components/lifecycle/MovementForm";
import { OnboardingForm } from "@/components/lifecycle/OnboardingForm";
import { TerminationForm } from "@/components/lifecycle/TerminationForm";
import { useToast } from "@/components/ui/Toast";
import { ProfileForm } from "@/components/users/EditUserView";
import type { LifecycleRequest } from "@/lib/lifecycle/types";
import type { Employee } from "@/lib/types";

/**
 * Revising a request, with the same form that raised it.
 *
 * Reusing the original form rather than a generic editor matters: the
 * validation, the before-and-after panel, and the wording the approvers end up
 * reading are the same ones they saw the first time, so a revision cannot
 * quietly be held to looser rules than the original.
 *
 * Sending it is one server call that bumps the version, voids every earlier
 * approval and link, and emails the manager about the new text.
 */
export function ReviseRequestView({
  request,
  employees,
  subject,
}: {
  request: LifecycleRequest;
  /** Everyone, for the manager pickers — and the subject, who has a request in flight. */
  employees: Employee[];
  /** The employee the request is about. Absent for an onboarding. */
  subject?: Employee;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();

  function done(revised: LifecycleRequest) {
    toast(
      `Revisi versi ${revised.version} terkirim. Email persetujuan dikirim ulang ke manager.`,
      "success",
    );
    router.push(`/pengajuan/${revised.id}`);
    router.refresh();
  }

  if (request.type === "ONBOARDING") {
    return <OnboardingForm employees={employees} revise={request} onSubmitted={done} />;
  }
  if (request.type === "MOVEMENT") {
    return <MovementForm employees={employees} revise={request} onSubmitted={done} />;
  }
  if (request.type === "TERMINATION") {
    return <TerminationForm employees={employees} revise={request} onSubmitted={done} />;
  }
  if (subject) {
    return <ProfileForm employee={subject} locked={false} revise={request} onSubmitted={done} />;
  }
  return <p className="text-sm text-ink-muted">{t.actions.subjectMissing}</p>;
}
