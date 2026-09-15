import { AuthCard } from "@/components/accounts/AuthCard";
import { PasswordResetForm } from "@/components/accounts/PasswordResetForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Atur ulang kata sandi · HC User Management" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthCard
      eyebrow="Pemulihan"
      title="Kata sandi baru"
      description="Pilih kata sandi baru untuk akun Anda. Tautan ini hanya bisa dipakai sekali."
    >
      <PasswordResetForm initialToken={typeof token === "string" ? token : ""} />
    </AuthCard>
  );
}
