"use client";

import { useEffect, useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card, Field } from "@/components/ui/Field";
import { IconMail } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { getJson, postJson } from "@/lib/client/accountsApi";

interface Status {
  service: string | null;
  outlook: {
    clientIdConfigured: boolean;
    redirectUri: string;
    connection: { accountEmail: string; displayName: string | null; connectedAt: string } | null;
  };
  testMode: { enabled: boolean; recipient: string | null };
}

const SERVICE_LABEL: Record<string, string> = {
  outlook: "Outlook (Microsoft)",
  resend: "Resend",
  smtp: "SMTP",
  gmail: "Gmail",
  sendgrid: "SendGrid",
};

/**
 * Where an admin connects the Outlook mailbox the portal sends from, once,
 * and checks that mail really goes out.
 */
export function EmailSettings({ initialNotice }: { initialNotice: { connected?: string; error?: string } }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getJson<Status>("/api/email/status").then((result) => {
      if (cancelled) return;
      if (result.ok) setStatus(result.data);
      else setLoadError(result.failure.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    const result = await getJson<Status>("/api/email/status");
    if (result.ok) setStatus(result.data);
  }

  async function disconnect() {
    setDisconnecting(true);
    const result = await postJson<{ disconnected: boolean }>("/api/email/outlook/disconnect", {});
    setDisconnecting(false);
    if (result.ok) {
      toast("Outlook diputuskan.", "success");
      await refresh();
    } else {
      toast(result.failure.message, "error");
    }
  }

  async function sendTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTesting(true);
    setTestResult(null);
    const result = await postJson<{ message: string }>("/api/email/test", { to: testTo });
    setTesting(false);
    setTestResult(result.ok ? { ok: true, message: result.data.message } : { ok: false, message: result.failure.message });
  }

  if (loadError) return <FormAlert tone="error">{loadError}</FormAlert>;
  if (!status) return <div className="h-40 animate-pulse rounded-2xl bg-hairline/60" aria-busy="true" />;

  const { outlook } = status;
  const usingOutlook = status.service === "outlook";

  return (
    <div className="space-y-5">
      {initialNotice.connected ? (
        <FormAlert tone="success">
          <p className="font-medium">Outlook terhubung sebagai {initialNotice.connected}.</p>
        </FormAlert>
      ) : null}
      <FormAlert tone="error">{initialNotice.error ?? null}</FormAlert>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">Cara kirim saat ini</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {status.service ? (SERVICE_LABEL[status.service] ?? status.service) : "Belum diatur (email hanya dicatat)"}
            </p>
          </div>
          <IconMail className="size-6 text-ink-faint" />
        </div>
        {status.testMode.enabled ? (
          <FormAlert tone="info">
            <p>
              <strong>Mode tes aktif:</strong> semua email dialihkan ke {status.testMode.recipient}. Matikan{" "}
              <code className="font-mono">TEST_MODE</code> supaya email sampai ke manager dan CISO yang sebenarnya.
            </p>
          </FormAlert>
        ) : null}
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-ink">Outlook</h2>
          <p className="text-sm text-ink-muted">
            Hubungkan satu kotak masuk Outlook sekali saja. Setelah itu semua email persetujuan dikirim dari kotak masuk
            tersebut ke alamat siapa pun, tanpa perlu diatur lagi.
          </p>
        </div>

        {!outlook.clientIdConfigured ? (
          <FormAlert tone="info">
            <p className="font-medium">Langkah 1: daftarkan aplikasi di Microsoft Entra</p>
            <p>
              Isi <code className="font-mono">OUTLOOK_CLIENT_ID</code> di <code className="font-mono">.env.local</code> dengan
              Application (client) ID. Redirect URI yang harus didaftarkan (platform Mobile &amp; desktop):
            </p>
            <p className="font-mono break-all">{outlook.redirectUri}</p>
          </FormAlert>
        ) : outlook.connection ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3">
            <div className="text-sm">
              <p className="font-semibold text-ok">Terhubung</p>
              <p className="text-ink">
                {outlook.connection.displayName ? `${outlook.connection.displayName} · ` : ""}
                <span className="font-mono">{outlook.connection.accountEmail}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/api/email/outlook/connect" className={buttonClasses("secondary", "sm")}>
                Hubungkan ulang
              </a>
              <Button variant="ghost" size="sm" loading={disconnecting} onClick={() => void disconnect()}>
                Putuskan
              </Button>
            </div>
          </div>
        ) : (
          <a href="/api/email/outlook/connect" className={buttonClasses()}>
            <IconMail className="size-4" />
            Hubungkan Outlook
          </a>
        )}

        {outlook.connection && !usingOutlook ? (
          <FormAlert tone="info">
            <p>
              Outlook sudah terhubung, tetapi pengiriman masih memakai {status.service ?? "pengaturan lama"}. Ubah{" "}
              <code className="font-mono">EMAIL_SERVICE</code> menjadi <code className="font-mono">outlook</code>.
            </p>
          </FormAlert>
        ) : null}
      </Card>

      <Card className="p-6">
        <form onSubmit={sendTest} noValidate className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Kirim email tes</h2>
            <p className="text-sm text-ink-muted">Memakai cara kirim yang sedang aktif, persis seperti email persetujuan.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field
              label="Kirim ke"
              name="testTo"
              type="email"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
              placeholder="nama@contoh.com"
              className="min-w-0 flex-1"
            />
            <Button type="submit" loading={testing}>
              {testing ? "Mengirim…" : "Kirim tes"}
            </Button>
          </div>
          {testResult ? <FormAlert tone={testResult.ok ? "success" : "error"}>{testResult.message}</FormAlert> : null}
        </form>
      </Card>
    </div>
  );
}
