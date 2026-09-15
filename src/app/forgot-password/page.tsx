import { AuthCard } from "@/components/accounts/AuthCard";
import { ForgotPasswordForm } from "@/components/accounts/ForgotPasswordForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lupa kata sandi · HC User Management" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      eyebrow="Pemulihan"
      title="Lupa kata sandi"
      description="Masukkan email akun Anda. Kami kirimkan tautan untuk membuat kata sandi baru."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
