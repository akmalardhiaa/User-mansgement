import { AuthCard } from "@/components/accounts/AuthCard";
import { VerifyEmailForm } from "@/components/accounts/VerifyEmailForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Konfirmasi email · HC User Management" };

/**
 * The page the verification link opens.
 *
 * The token is read here on the server and handed down as a prop, so the form
 * never has to reach into `location` after mounting — which would mean a frame
 * where it has nothing to submit.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthCard
      eyebrow="Konfirmasi"
      title="Konfirmasi email"
      description="Satu langkah terakhir sebelum Anda bisa masuk ke portal."
    >
      <VerifyEmailForm initialToken={typeof token === "string" ? token : ""} />
    </AuthCard>
  );
}
