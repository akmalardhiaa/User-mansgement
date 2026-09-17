// Obtains the Gmail refresh token the email driver needs, once.
//
//   npm run gmail:auth
//
// It reads GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET from .env.local — the same
// variables the app uses (see .env.example) — opens the Google consent screen,
// and prints the refresh token to paste back into .env.local.
//
// Two things this handles that are easy to get wrong by hand:
//
//   - `prompt=consent` is sent every time. Without it, authorising an app that
//     was already authorised returns an access token and NO refresh token, and
//     the usual result is an empty GMAIL_REFRESH_TOKEN with nothing explaining
//     why.
//   - The code comes back on a loopback address rather than being copied by
//     hand. Google retired the out-of-band copy-paste flow; a Desktop client
//     may use http://localhost on any port, so this listens on a free one.
//
// The token is printed, never written to .env.local: this script does not know
// what else is in that file.

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const clientId = process.env.GMAIL_CLIENT_ID?.trim();
const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error(
    "\n  GMAIL_CLIENT_ID atau GMAIL_CLIENT_SECRET belum diset di .env.local.\n" +
      "  Buat OAuth client bertipe Desktop app di console.cloud.google.com,\n" +
      "  isi keduanya (lihat .env.example), lalu jalankan lagi.\n",
  );
  process.exit(1);
}

// Only the ability to send. This cannot read the mailbox it sends from.
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TIMEOUT_MS = 5 * 60_000;

const state = randomBytes(16).toString("hex");

function page(title, detail) {
  return (
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
    `<body style="font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
    `<h1 style="font-size:1.25rem">${title}</h1><p>${detail}</p></body>`
  );
}

/** Waits for Google to send the browser back with a code. */
function awaitCode(server) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Tidak ada jawaban dalam 5 menit; consent dibatalkan."));
    }, TIMEOUT_MS);
    timer.unref();

    server.on("request", (request, response) => {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname !== "/") {
        response.writeHead(404).end();
        return;
      }

      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const returned = url.searchParams.get("state");

      const finish = (status, title, detail, outcome) => {
        response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
        response.end(page(title, detail));
        clearTimeout(timer);
        outcome();
      };

      if (error) {
        finish(400, "Consent ditolak", `Google menjawab: ${error}`, () =>
          reject(new Error(`Consent ditolak: ${error}`)),
        );
        return;
      }

      // The loopback is reachable by anything on this machine, so the value
      // that comes back has to be the one that went out.
      if (returned !== state) {
        finish(400, "State tidak cocok", "Permintaan ini tidak berasal dari sesi ini.", () =>
          reject(new Error("State tidak cocok; jawaban diabaikan.")),
        );
        return;
      }

      if (!code) {
        finish(400, "Tidak ada code", "Google tidak mengirimkan authorization code.", () =>
          reject(new Error("Google tidak mengirimkan authorization code.")),
        );
        return;
      }

      finish(200, "Selesai", "Tab ini boleh ditutup; kembali ke terminal.", () => resolve(code));
    });
  });
}

const server = createServer();

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://localhost:${server.address().port}`;

  const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  consent.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    // Both are needed for a refresh token, every time.
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();

  // Listening before the URL is shown. Node drops a `request` event that has no
  // listener yet, and while nothing can reach the loopback before somebody
  // opens the link, ordering it this way makes that impossible rather than
  // merely unlikely.
  const pending = awaitCode(server);

  console.info("\n  Buka tautan ini di browser, lalu setujui akses kirim email:\n");
  console.info(`  ${consent.toString()}\n`);
  console.info("  Menunggu jawaban …");

  const code = await pending;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      `Penukaran code gagal (HTTP ${response.status}): ${payload.error_description ?? payload.error ?? "tidak diketahui"}`,
    );
  }

  if (!payload.refresh_token) {
    // Almost always a re-authorisation without prompt=consent, which this does
    // send — so reaching here means something stripped it.
    throw new Error("Google tidak mengembalikan refresh_token. Cabut akses aplikasi, lalu ulangi.");
  }

  console.info("\n  ✓ Refresh token diperoleh. Tambahkan ke .env.local:\n");
  console.info(`  GMAIL_REFRESH_TOKEN=${payload.refresh_token}\n`);
  console.info("  Lalu set EMAIL_DRIVER=gmail dan pastikan GMAIL_SENDER adalah akun");
  console.info("  yang baru saja memberi consent.\n");
  console.info("  Selama consent screen masih berstatus Testing, Google mengedaluwarsakan");
  console.info("  token ini dalam 7 hari.\n");
} catch (error) {
  console.error(`\n  ✗ Gagal: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  server.close();
}
