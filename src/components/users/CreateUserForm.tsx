"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, Field } from "@/components/ui/Field";
import {
  SubmissionError,
  apiDataSource,
  type CreateUserResult,
  type DashboardDataSource,
} from "@/lib/client/dataSource";
import type { NewUserInput } from "@/lib/types";

type FieldErrors = Partial<Record<keyof NewUserInput, string>>;

const EMPTY: NewUserInput = {
  name: "",
  email: "",
  jobTitle: "",
  department: "",
  managerName: "",
  managerEmail: "",
};

const DEPARTMENTS = ["Engineering", "Human Capital", "Finance", "Product", "IT Security", "Sales"];

/**
 * Step 1 of the workflow from the HC side.
 *
 * Submitting never activates an account — it hands the request to the manager
 * via Jira, which the confirmation panel makes explicit.
 */
export function CreateUserForm({
  dataSource = apiDataSource,
  onCreated,
  onTrack,
}: {
  dataSource?: DashboardDataSource;
  onCreated?: () => void;
  /** Demo mode switches tab instead of navigating to /requests. */
  onTrack?: () => void;
} = {}) {
  const router = useRouter();
  const [values, setValues] = useState<NewUserInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<CreateUserResult | null>(null);

  function update(field: keyof NewUserInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await dataSource.createUser(values);
      setSuccess(result);
      setValues(EMPTY);
      if (onCreated) {
        onCreated();
      } else {
        router.refresh();
      }
    } catch (cause) {
      if (cause instanceof SubmissionError && cause.fieldErrors) {
        setFieldErrors(cause.fieldErrors as FieldErrors);
      }
      setFormError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-ok/30 bg-ok/10 text-ok">
            ✓
          </span>
          <div>
            <h2 className="text-lg font-semibold">Pengajuan terkirim</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {success.employee.name} tercatat sebagai{" "}
              <strong className="text-ink">Menunggu manager</strong> dan belum aktif. Tiket
              persetujuan sudah dibuat untuk {success.employee.managerName}.
            </p>
            {/* Assignment is what triggers Jira's email, so say plainly whether
                the approver was actually reached. */}
            {success.managerIssue?.assignee ? (
              <p className="mt-2 text-sm text-ok">
                Jira sudah mengirim email ke {success.managerIssue.assignee} — persetujuan bisa
                langsung dilakukan dari tiketnya.
              </p>
            ) : (
              <p className="mt-2 text-sm text-warn">
                Tidak ada akun Jira yang cocok dengan {success.employee.managerEmail}, jadi tiket
                belum ter-assign dan email tidak terkirim. Assign manual di Jira.
              </p>
            )}
          </div>
        </div>

        {success.managerIssue ? (
          <a
            href={success.managerIssue.url}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex items-center justify-between rounded-xl border border-hairline-strong bg-elevated px-4 py-3 transition-colors hover:border-accent/50"
          >
            <span>
              <span className="block text-xs text-ink-faint">Tiket persetujuan manager</span>
              <span className="font-mono text-sm text-accent-soft">{success.managerIssue.key}</span>
            </span>
            <span className="text-sm text-ink-muted">Buka di Jira ↗</span>
          </a>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {onTrack ? (
            <Button onClick={onTrack}>Lihat progres</Button>
          ) : (
            <Link
              href="/requests"
              className="inline-flex items-center rounded-lg border border-accent/60 bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-soft"
            >
              Lihat progres
            </Link>
          )}
          <Button variant="secondary" onClick={() => setSuccess(null)}>
            Tambah akun lain
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} noValidate>
        {formError ? (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Nama lengkap"
            name="name"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            error={fieldErrors.name}
            placeholder="Nadia Kusuma"
            autoComplete="off"
          />
          <Field
            label="Email kantor"
            name="email"
            type="email"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            error={fieldErrors.email}
            placeholder="nadia.kusuma@example.com"
            autoComplete="off"
          />
          <Field
            label="Jabatan"
            name="jobTitle"
            value={values.jobTitle}
            onChange={(event) => update("jobTitle", event.target.value)}
            error={fieldErrors.jobTitle}
            placeholder="Backend Engineer"
            autoComplete="off"
          />
          <Field
            label="Departemen"
            name="department"
            list="department-options"
            value={values.department}
            onChange={(event) => update("department", event.target.value)}
            error={fieldErrors.department}
            placeholder="Engineering"
            autoComplete="off"
          />
          <datalist id="department-options">
            {DEPARTMENTS.map((department) => (
              <option key={department} value={department} />
            ))}
          </datalist>
          <Field
            label="Nama manager"
            name="managerName"
            value={values.managerName}
            onChange={(event) => update("managerName", event.target.value)}
            error={fieldErrors.managerName}
            placeholder="Sarah Wijaya"
            autoComplete="off"
          />
          <Field
            label="Email manager"
            name="managerEmail"
            type="email"
            value={values.managerEmail}
            onChange={(event) => update("managerEmail", event.target.value)}
            error={fieldErrors.managerEmail}
            hint="Dipakai untuk mencari akun Jira-nya, agar Jira mengirim email tiket persetujuan."
            placeholder="sarah.wijaya@example.com"
            autoComplete="off"
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Mengirim ke Jira…" : "Ajukan persetujuan"}
          </Button>
          <Link href="/" className="text-sm text-ink-muted hover:text-ink">
            Batal
          </Link>
          <p className="w-full text-xs text-ink-faint sm:ml-auto sm:w-auto">
            Mengirim form ini membuat tiket persetujuan di Jira — bukan langsung membuat akun aktif.
          </p>
        </div>
      </form>
    </Card>
  );
}
