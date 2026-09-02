import { LoginAside } from "@/components/auth/LoginAside";
import { LoginForm } from "@/components/auth/LoginForm";
import { Reveal } from "@/components/motion/Reveal";
import { BrandMark } from "@/components/ui/BrandMark";
import { Card } from "@/components/ui/Field";
import { IconAlert } from "@/components/ui/Icons";
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
    // `content-center` rather than `flex-1`: the shell's <main> is not a flex
    // container, so the grid has to centre itself against its own min-height.
    <div className="mx-auto grid w-full max-w-4xl min-h-[68vh] content-center items-center gap-8 lg:grid-cols-2">
      <Reveal delay={0.06}>
        <LoginAside />
      </Reveal>

      <Reveal className="mx-auto w-full max-w-sm">
        <div className="mb-6 lg:hidden">
          <BrandMark size="lg" />
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
              <p className="flex items-center gap-2 font-medium text-warn">
                <IconAlert className="size-4" />
                Login belum dikonfigurasi
              </p>
              <p className="mt-2 text-ink-muted">
                Setel <code className="font-mono text-ink">HC_AUTH_USERS</code> dan{" "}
                <code className="font-mono text-ink">AUTH_SECRET</code> di environment, lalu
                jalankan ulang aplikasinya. Contohnya ada di{" "}
                <code className="font-mono text-ink">.env.example</code>.
              </p>
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
