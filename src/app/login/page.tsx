import { LoginForm } from "@/components/auth/LoginForm";
import { Card } from "@/components/ui/Field";
import { isAuthConfigured } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Masuk · HC User Management" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only same-site paths, so `?next=` can never bounce someone to another host.
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const configured = isAuthConfigured();

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-soft text-sm font-bold text-accent-ink">
          HC
        </span>
        <span className="font-semibold tracking-tight">User Management</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">Masuk</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        Portal Human Capital untuk pengelolaan akun karyawan.
      </p>

      <Card className="p-6">
        {configured ? (
          <LoginForm next={destination} />
        ) : (
          <div className="text-sm">
            <p className="font-medium text-warn">Login belum dikonfigurasi</p>
            <p className="mt-2 text-ink-muted">
              Setel <code className="font-mono text-ink">HC_AUTH_USERS</code> dan{" "}
              <code className="font-mono text-ink">AUTH_SECRET</code> di environment, lalu jalankan
              ulang aplikasinya. Contohnya ada di{" "}
              <code className="font-mono text-ink">.env.example</code>.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
