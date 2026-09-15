import Link from "next/link";

import { LoginAside } from "@/components/auth/LoginAside";
import { LoginForm } from "@/components/auth/LoginForm";
import { Reveal } from "@/components/motion/Reveal";
import { BrandMark } from "@/components/ui/BrandMark";
import { Card } from "@/components/ui/Field";
import { IconAlert } from "@/components/ui/Icons";
import { isAccountSystemConfigured } from "@/lib/config/authEnv";

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
  const configured = isAccountSystemConfigured();

  return (
    // `content-center` rather than `flex-1`: the shell's <main> is not a flex
    // container, so the grid has to centre itself against its own min-height.
    <div className="mx-auto grid w-full max-w-4xl min-h-[68vh] content-center items-center gap-8 lg:grid-cols-2">
      <Reveal delay={0.06}>
        <LoginAside />
      </Reveal>

      <Reveal className="mx-auto w-full max-w-md">
        <div className="mb-6 lg:hidden">
          <BrandMark size="lg" />
        </div>

        <div className="mb-6 space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface/80 px-3 py-1 text-xs text-ink-muted backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            <span className="font-semibold text-shimmer-brand">User Management</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Masuk Portal
          </h1>
          <p className="text-sm text-ink-muted">
            Silakan masukkan kredensial akun Human Capital Anda.
          </p>
        </div>

        <Card className="relative overflow-hidden p-6 sm:p-7 backdrop-blur-xl border-hairline-strong/70 shadow-[0_12px_40px_-15px_rgba(7,19,33,0.6)]">
          {/* Subtle accent sheen line on top of card */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent opacity-80" />

          {configured ? (
            <>
              <LoginForm next={destination} />
              {/* No sign-up link: accounts are created by HC and activated only
                  after the manager and the CISO approve them. */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-sm">
                <Link
                  href="/forgot-password"
                  className="text-ink-muted transition-colors hover:text-accent"
                >
                  Lupa kata sandi?
                </Link>
                <span className="text-ink-faint">Akun baru dibuat oleh HC</span>
              </div>
            </>
          ) : (
            <div className="text-sm">
              <p className="flex items-center gap-2 font-medium text-warn">
                <IconAlert className="size-4" />
                Login belum dikonfigurasi
              </p>
              <p className="mt-2 text-ink-muted">
                Setel <code className="font-mono text-ink">DATABASE_URL</code> dan{" "}
                <code className="font-mono text-ink">JWT_SECRET</code> di environment, lalu
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
