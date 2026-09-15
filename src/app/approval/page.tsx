import { ApprovalPage } from "@/components/approval/ApprovalPage";
import { Reveal } from "@/components/motion/Reveal";
import { BrandMark } from "@/components/ui/BrandMark";
import { Card } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Persetujuan user · HC User Management",
  // Reached from an email and holds a live token: keep it out of indexes.
  robots: { index: false, follow: false },
};

/** Public: the emailed token is the credential. See ApprovalPage for why opening it changes nothing. */
export default async function ApprovalRoute({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; action?: string }>;
}) {
  const { token, action } = await searchParams;

  return (
    <div className="mx-auto grid min-h-[70vh] w-full max-w-2xl content-center gap-6">
      <Reveal>
        <div className="mb-6">
          <BrandMark size="lg" />
        </div>
        <Card className="relative overflow-hidden border-hairline-strong/70 p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent opacity-80" />
          <ApprovalPage
            token={typeof token === "string" ? token : ""}
            initialAction={action === "reject" ? "reject" : action === "approve" ? "approve" : undefined}
          />
        </Card>
      </Reveal>
    </div>
  );
}
