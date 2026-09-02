"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { DEPARTMENTS } from "@/lib/db/seed";
import { Button } from "@/components/ui/Button";
import { Card, Field, TextareaField } from "@/components/ui/Field";
import {
  IconAlert,
  IconApprovals,
  IconBriefcase,
  IconBuilding,
  IconCheck,
  IconExternal,
  IconIdCard,
  IconMail,
  IconNote,
  IconUser,
  IconUserCheck,
  IconUserPlus,
} from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import {
  SubmissionError,
  apiDataSource,
  type CreateUserResult,
  type DashboardDataSource,
} from "@/lib/client/dataSource";
import { TRANSITION, TRANSITION_FAST, stagger, staggerItem } from "@/lib/motion";
import type { NewUserInput } from "@/lib/types";

type FieldErrors = Partial<Record<keyof NewUserInput, string>>;

const EMPTY: NewUserInput = {
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  jobTitle: "",
  department: "",
  managerName: "",
  managerEmail: "",
  description: "",
};

/** Section heading: a small glyph, then the label it belongs to. */
const SECTION_CLASSES =
  "mb-4 flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-ink-faint uppercase";

/** The fields that must be filled before the form can be sent. */
const REQUIRED: ReadonlyArray<keyof NewUserInput> = [
  "firstName",
  "lastName",
  "displayName",
  "email",
  "jobTitle",
  "department",
  "managerName",
  "managerEmail",
];

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
  const { toast } = useToast();
  const [values, setValues] = useState<NewUserInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<CreateUserResult | null>(null);
  const nameEdited = useRef(false);

  // Drives the progress meter. Purely a nudge — the server is still the only
  // thing that decides whether the payload is acceptable.
  const filled = REQUIRED.filter((field) => (values[field] ?? "").trim().length > 0).length;
  const progress = filled / REQUIRED.length;

  function update(field: keyof NewUserInput, value: string) {
    setValues((current) => {
      const next = { ...current, [field]: value };
      // The full name follows first/last until HC edits it directly, which is
      // how it is usually derived in the directory.
      if (field === "firstName" || field === "lastName") {
        if (!nameEdited.current) next.displayName = `${next.firstName} ${next.lastName}`.trim();
      }
      if (field === "displayName") {
        nameEdited.current = value.trim().length > 0;
      }
      return next;
    });
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
      nameEdited.current = false;
      toast(`Pengajuan untuk ${result.employee.displayName} dikirim ke Jira.`);
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
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={TRANSITION}>
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.1 }}
              className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-ok/30 bg-ok/10 text-ok"
            >
              <IconCheck className="size-4" />
            </motion.span>
            <div>
              <h2 className="text-lg font-semibold">Pengajuan terkirim</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {success.employee.displayName} tercatat sebagai{" "}
                <strong className="text-ink">Menunggu manager</strong> dan belum aktif. Tiket
                persetujuan sudah dibuat untuk {success.employee.managerName}.
              </p>
              {/* Assignment is what triggers Jira's email, so say plainly whether
                  the approver was actually reached. */}
              {success.managerIssue?.assignee ? (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-ok">
                  <IconCheck className="mt-0.5 size-3.5" />
                  Jira sudah mengirim email ke {success.managerIssue.assignee} — persetujuan bisa
                  langsung dilakukan dari tiketnya.
                </p>
              ) : (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-warn">
                  <IconAlert className="mt-0.5 size-3.5" />
                  <span>
                    Tidak ada akun Jira yang cocok dengan {success.employee.managerEmail}, jadi
                    tiket belum ter-assign dan email tidak terkirim. Assign manual di Jira.
                  </span>
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
                <span className="font-mono text-sm text-accent-soft">
                  {success.managerIssue.key}
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                Buka di Jira
                <IconExternal className="size-3.5" />
              </span>
            </a>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {onTrack ? (
              <Button onClick={onTrack}>Lihat progres</Button>
            ) : (
              <Link
                href="/requests"
                className="inline-flex items-center rounded-lg border border-accent/70 bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-all duration-200 hover:bg-accent-soft active:scale-[0.97]"
              >
                Lihat progres
              </Link>
            )}
            <Button variant="secondary" icon={<IconUserPlus />} onClick={() => setSuccess(null)}>
              Tambah akun lain
            </Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Fills as the required fields do. A form this long benefits from
          something that says how much of it is left. */}
      <div className="h-0.5 w-full bg-elevated">
        <motion.div
          animate={{ scaleX: progress }}
          transition={TRANSITION_FAST}
          style={{ transformOrigin: "left" }}
          className="h-full bg-accent"
        />
      </div>

      <form onSubmit={handleSubmit} noValidate className="p-6">
        <AnimatePresence initial={false}>
          {formError ? (
            <motion.p
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={TRANSITION_FAST}
              className="mb-5 flex items-start gap-2 overflow-hidden rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
            >
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {formError}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <motion.div variants={stagger(0.04)} initial="hidden" animate="visible">
          <motion.p variants={staggerItem} className={SECTION_CLASSES}>
            <IconUser className="size-3.5" />
            Data karyawan
          </motion.p>

          <div className="grid gap-5 sm:grid-cols-2">
            <motion.div variants={staggerItem}>
              <Field
                label="Nama depan"
                name="firstName"
                icon={<IconUser className="size-4" />}
                value={values.firstName}
                onChange={(event) => update("firstName", event.target.value)}
                error={fieldErrors.firstName}
                placeholder="Nadia"
                autoComplete="off"
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <Field
                label="Nama belakang"
                name="lastName"
                icon={<IconUser className="size-4" />}
                value={values.lastName}
                onChange={(event) => update("lastName", event.target.value)}
                error={fieldErrors.lastName}
                placeholder="Kusuma"
                autoComplete="off"
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <Field
                label="Nama lengkap"
                name="displayName"
                // A card rather than a person: this is the directory record's
                // own name, not a third human being.
                icon={<IconIdCard className="size-4" />}
                value={values.displayName}
                onChange={(event) => update("displayName", event.target.value)}
                error={fieldErrors.displayName}
                hint="Terisi otomatis dari nama depan dan belakang; bisa diubah."
                placeholder="Nadia Kusuma"
                autoComplete="off"
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <Field
                label="Email"
                name="email"
                type="email"
                icon={<IconMail className="size-4" />}
                value={values.email}
                onChange={(event) => update("email", event.target.value)}
                error={fieldErrors.email}
                placeholder="nadia.kusuma@example.com"
                autoComplete="off"
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <Field
                label="Jabatan"
                name="jobTitle"
                icon={<IconBriefcase className="size-4" />}
                value={values.jobTitle}
                onChange={(event) => update("jobTitle", event.target.value)}
                error={fieldErrors.jobTitle}
                placeholder="Backend Engineer"
                autoComplete="off"
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <Field
                label="Departemen"
                name="department"
                list="department-options"
                icon={<IconBuilding className="size-4" />}
                value={values.department}
                onChange={(event) => update("department", event.target.value)}
                error={fieldErrors.department}
                hint="Pilih dari daftar, atau ketik divisi baru."
                placeholder="Engineering"
                autoComplete="off"
              />
              <datalist id="department-options">
                {DEPARTMENTS.map((department) => (
                  <option key={department} value={department} />
                ))}
              </datalist>
            </motion.div>
          </div>

          <motion.p variants={staggerItem} className={`mt-8 ${SECTION_CLASSES}`}>
            <IconApprovals className="size-3.5" />
            Atasan yang menyetujui
          </motion.p>

          <div className="grid gap-5 sm:grid-cols-2">
            <motion.div variants={staggerItem}>
              <Field
                label="Nama manager"
                name="managerName"
                // The tick separates the approver from the six plain-person
                // fields above: this is the one who has to say yes.
                icon={<IconUserCheck className="size-4" />}
                value={values.managerName}
                onChange={(event) => update("managerName", event.target.value)}
                error={fieldErrors.managerName}
                placeholder="Sarah Wijaya"
                autoComplete="off"
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <Field
                label="Email manager"
                name="managerEmail"
                type="email"
                icon={<IconMail className="size-4" />}
                value={values.managerEmail}
                onChange={(event) => update("managerEmail", event.target.value)}
                error={fieldErrors.managerEmail}
                hint="Dipakai untuk mencari akun Jira-nya, agar Jira mengirim email tiket persetujuan."
                placeholder="sarah.wijaya@example.com"
                autoComplete="off"
              />
            </motion.div>
          </div>

          <motion.div variants={staggerItem} className="mt-8">
            <TextareaField
              label="Keterangan"
              name="description"
              rows={3}
              icon={<IconNote className="size-4" />}
              value={values.description ?? ""}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Catatan tambahan untuk manager dan IT Security — opsional"
              hint="Ikut tercantum di kedua tiket Jira."
            />
          </motion.div>
        </motion.div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
          <Button type="submit" loading={submitting} icon={<IconUserPlus />}>
            {submitting ? "Mengirim ke Jira…" : "Ajukan persetujuan"}
          </Button>
          <Link href="/" className="text-sm text-ink-muted transition-colors hover:text-ink">
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
