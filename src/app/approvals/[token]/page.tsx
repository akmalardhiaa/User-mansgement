import { ApprovalDecision } from "@/components/approvals/ApprovalDecision";
import { Reveal } from "@/components/motion/Reveal";
import { BrandMark } from "@/components/ui/BrandMark";
import { Card } from "@/components/ui/Field";
import { IconAlert, IconCheck } from "@/components/ui/Icons";
import { listEmployees, listRequests } from "@/lib/db/repository";
import { lookupApproval } from "@/lib/workflow/emailApproval";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Persetujuan · HC User Management",
  // The page is reached from a link in an email and contains a live token.
  // Keeping it out of indexes is the cheapest way to stop a forwarded link
  // turning up in a search result.
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-lg min-h-[70vh] content-center gap-6">
      <Reveal>
        <div className="mb-6">
          <BrandMark size="lg" />
        </div>
        <Card className="relative overflow-hidden border-hairline-strong/70 p-6 shadow-[0_12px_40px_-15px_rgba(7,19,33,0.6)] backdrop-blur-xl sm:p-7">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent opacity-80" />
          {children}
        </Card>
      </Reveal>
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "error" | "success";
  title: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? IconAlert : IconCheck;
  const colour = tone === "error" ? "text-warn" : "text-ok";
  return (
    <div className="text-sm">
      <p className={`flex items-center gap-2 font-semibold ${colour}`}>
        <Icon className="size-4" />
        {title}
      </p>
      <p className="mt-2 text-ink-muted">{children}</p>
    </div>
  );
}

/**
 * The page a manager lands on from the approval email.
 *
 * Public — the manager has no account, and the emailed token is the
 * credential. It only *renders* the request; the decision itself is a POST from
 * the client component, so a mail scanner that follows the link cannot approve
 * anything by visiting it.
 */
export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [requests, employees] = await Promise.all([listRequests(), listEmployees()]);
  const found = lookupApproval(requests, employees, token);

  if (found.status === "not-found") {
    return (
      <Shell>
        <Notice tone="error" title="Tautan tidak valid">
          Tautan persetujuan ini tidak dikenali. Mungkin sudah diganti dengan yang baru — silakan
          hubungi Human Capital.
        </Notice>
      </Shell>
    );
  }

  if (found.status === "expired") {
    return (
      <Shell>
        <Notice tone="error" title="Tautan kedaluwarsa">
          Permintaan ini sudah melewati batas waktu persetujuan. Minta Human Capital mengirim ulang
          permintaannya.
        </Notice>
      </Shell>
    );
  }

  if (found.status === "already-decided") {
    return (
      <Shell>
        <Notice tone="success" title="Sudah diputuskan">
          {found.kind === "SECURITY" ? "Penyiapan akses ini" : "Keputusan untuk permintaan ini"} sudah
          tercatat pada{" "}
          {new Date(found.decidedAt).toLocaleString("id-ID", {
            dateStyle: "long",
            timeStyle: "short",
          })}
          {found.decidedBy ? ` oleh ${found.decidedBy}` : ""}. Tidak ada tindakan lain yang
          diperlukan.
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <ApprovalDecision
        token={token}
        kind={found.kind}
        employee={found.employee}
        request={found.request}
        expiresAt={found.handoff.expiresAt}
      />
    </Shell>
  );
}
