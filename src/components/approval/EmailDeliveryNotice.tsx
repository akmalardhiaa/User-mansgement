import { IconAlert } from "@/components/ui/Icons";

/**
 * Shown to admins while no sender account is configured.
 *
 * Without it the app looks finished — requests are created, the audit trail
 * says "email dikirim" — and nothing tells HC that no inbox will ever receive
 * a thing. This is the one place that says so, on every page, until it is true.
 */
export function EmailDeliveryNotice() {
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm"
    >
      <IconAlert className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="space-y-1">
        <p className="font-semibold text-warn">Email belum dikirim sungguhan</p>
        <p className="text-ink-muted">
          Akun Gmail pengirim belum dipasang, jadi email persetujuan hanya dicatat di log server dan{" "}
          <strong className="text-ink">tidak masuk ke inbox siapa pun</strong>. Isi{" "}
          <code className="font-mono text-ink">EMAIL_SERVICE</code>,{" "}
          <code className="font-mono text-ink">EMAIL_USER</code>, dan{" "}
          <code className="font-mono text-ink">EMAIL_PASSWORD</code> (App Password Gmail) di{" "}
          <code className="font-mono text-ink">.env.local</code>, lalu jalankan{" "}
          <code className="font-mono text-ink">npm run email:test</code>.
        </p>
      </div>
    </div>
  );
}
