import nextEnv from "@next/env";
import nodemailer from "nodemailer";

/**
 * npm run email:test [recipient]
 *
 * Sends one real email with the settings in .env.local and says, in plain
 * words, what went wrong if it does not arrive. Recipient defaults to
 * TEST_RECIPIENT, then to EMAIL_USER.
 *
 * Plain JavaScript on purpose: it runs under bare node, outside the Next build.
 */

nextEnv.loadEnvConfig(process.cwd(), true);

const service = process.env.EMAIL_SERVICE?.trim().toLowerCase();
const user = process.env.EMAIL_USER?.trim();
// Google shows App Passwords in groups of four; the spaces are not part of it.
const password = process.env.EMAIL_PASSWORD?.replace(/\s+/g, "");
const from = process.env.EMAIL_FROM?.trim() || user;
const to = process.argv[2]?.trim() || process.env.TEST_RECIPIENT?.trim() || user;

function stop(lines) {
  console.error(`\n  ${lines.join("\n  ")}\n`);
  process.exit(1);
}

if (!service) {
  stop([
    "EMAIL_SERVICE belum diisi di .env.local, jadi aplikasi hanya mencatat email tanpa mengirim.",
    "",
    "Tambahkan:",
    '  EMAIL_SERVICE="gmail"',
    '  EMAIL_USER="akun-pengirim@gmail.com"',
    '  EMAIL_PASSWORD="16 huruf App Password"',
    "",
    "App Password dibuat di https://myaccount.google.com/apppasswords (butuh Verifikasi 2 Langkah).",
  ]);
}

if (service === "resend") {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    stop(["RESEND_API_KEY kosong di .env.local.", "Buat API key di https://resend.com/api-keys"]);
  }
  const sender = process.env.EMAIL_FROM?.trim() || "HC Portal <onboarding@resend.dev>";
  console.log(`\n  Mengirim email tes lewat Resend ke ${to} …`);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sender,
      to: [to],
      subject: "[HC Portal] Tes pengiriman email berhasil",
      text: "Pengaturan email sudah benar. Email persetujuan dari HC Portal sekarang akan terkirim otomatis.",
      html: "<p><strong>Tes pengiriman email berhasil.</strong></p><p>Email persetujuan dari HC Portal sekarang akan terkirim otomatis.</p>",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.ok) {
    console.log(`  TERKIRIM. ID Resend: ${body.id}`);
    console.log("  Cek inbox (dan folder Spam/Promosi) di alamat tersebut.\n");
    process.exit(0);
  }
  if (response.status === 401 || /api key/i.test(body.message ?? "")) {
    stop(["Resend menolak API key.", "Salin ulang dari https://resend.com/api-keys (diawali re_).", `Pesan: ${body.message ?? ""}`]);
  }
  if (response.status === 403) {
    stop([
      "Resend menolak penerima.",
      "Tanpa domain terverifikasi, Resend hanya mengirim ke email yang dipakai untuk mendaftar akun Resend.",
      `Pastikan akun Resend didaftarkan dengan ${to}, atau ubah TEST_RECIPIENT ke email akun Resend Anda.`,
      `Pesan: ${body.message ?? ""}`,
    ]);
  }
  stop([`Resend ${response.status}: ${body.message ?? JSON.stringify(body)}`]);
}

if (service === "smtp") {
  const host = process.env.EMAIL_HOST?.trim();
  const port = Number(process.env.EMAIL_PORT?.trim() || 587);
  const smtpUser = process.env.EMAIL_USER?.trim();
  const smtpPass = process.env.EMAIL_PASSWORD?.trim();
  const sender = process.env.EMAIL_FROM?.trim();
  if (!host || !smtpUser || !smtpPass) {
    stop(["EMAIL_HOST, EMAIL_USER, dan EMAIL_PASSWORD wajib diisi untuk EMAIL_SERVICE=smtp."]);
  }
  if (!sender) {
    stop([
      "EMAIL_FROM belum diisi.",
      "Isi dengan alamat pengirim yang terdaftar di layanan SMTP (untuk Brevo: email akun Brevo Anda).",
      "EMAIL_USER untuk Brevo adalah SMTP login seperti xxxx@smtp-brevo.com, bukan alamat pengirim.",
    ]);
  }
  const smtpTransport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user: smtpUser, pass: smtpPass } });
  console.log(`\n  Menguji login SMTP ${host}:${port} sebagai ${smtpUser} …`);
  try {
    await smtpTransport.verify();
  } catch (error) {
    const code = error?.code;
    const response = String(error?.response ?? error?.message ?? "");
    const firstLine = response.split("\n")[0];
    if (code === "EAUTH" || /535|authentication/i.test(response)) {
      stop([
        "Server SMTP MENOLAK login.",
        "Untuk Brevo: EMAIL_USER = SMTP login (xxxx@smtp-brevo.com), EMAIL_PASSWORD = SMTP key,",
        "keduanya dari menu SMTP & API di Brevo. Password akun Brevo tidak bisa dipakai.",
        `Pesan server: ${firstLine}`,
      ]);
    }
    stop([`Tidak bisa terhubung ke ${host}:${port}: ${code ?? ""} ${firstLine}`]);
  }
  console.log("  Login SMTP berhasil.");
  console.log(`  Mengirim email tes dari ${sender} ke ${to} …`);
  try {
    const info = await smtpTransport.sendMail({
      from: sender,
      to,
      subject: "[HC Portal] Tes pengiriman email berhasil",
      text: "Pengaturan email sudah benar. Email persetujuan dari HC Portal sekarang terkirim otomatis ke alamat siapa pun.",
      html: "<p><strong>Tes pengiriman email berhasil.</strong></p><p>Email persetujuan dari HC Portal sekarang terkirim otomatis ke alamat siapa pun.</p>",
    });
    console.log(`  TERKIRIM. Diterima server untuk: ${info.accepted.join(", ")}`);
    console.log("  Cek inbox (dan folder Spam/Promosi) di alamat tersebut.\n");
    process.exit(0);
  } catch (error) {
    stop([`Login berhasil tetapi pengiriman gagal: ${error?.response ?? error?.message}`]);
  }
}

if (service !== "gmail") {
  stop([`Skrip ini menguji gmail, smtp (misalnya Brevo), atau resend. EMAIL_SERVICE saat ini "${service}".`]);
}

if (!user || !password) {
  stop(["EMAIL_USER atau EMAIL_PASSWORD kosong di .env.local."]);
}

if (password.length !== 16) {
  console.warn(
    `\n  Peringatan: EMAIL_PASSWORD berisi ${password.length} karakter. App Password Gmail selalu 16 huruf —` +
      "\n  kalau ini password akun biasa, Gmail akan menolaknya.\n",
  );
}

const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass: password } });

console.log(`\n  Menguji login Gmail sebagai ${user} …`);
try {
  await transport.verify();
} catch (error) {
  const code = error?.code;
  const response = String(error?.response ?? error?.message ?? "");
  if (code === "EAUTH" || /535|534|Username and Password not accepted|Application-specific password required/i.test(response)) {
    stop([
      "Gmail MENOLAK login.",
      "",
      "Penyebab yang paling sering:",
      "  - EMAIL_PASSWORD berisi password akun biasa, bukan App Password 16 huruf",
      "  - App Password dibuat di akun Gmail lain, bukan akun di EMAIL_USER",
      "  - App Password sudah dihapus atau dicabut di pengaturan Google",
      "",
      `Pesan dari Gmail: ${response.split("\n")[0]}`,
    ]);
  }
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED", "EDNS"].includes(code)) {
    stop([
      "Tidak bisa terhubung ke smtp.gmail.com.",
      "Periksa koneksi internet, VPN, atau firewall kantor yang memblokir port 465/587.",
      `Detail: ${code} ${response.split("\n")[0]}`,
    ]);
  }
  stop([`Gagal: ${code ?? ""} ${response.split("\n")[0]}`]);
}

console.log("  Login Gmail berhasil.");
console.log(`  Mengirim email tes ke ${to} …`);

try {
  const info = await transport.sendMail({
    from,
    to,
    subject: "[HC Portal] Tes pengiriman email berhasil",
    text:
      "Email ini dikirim oleh `npm run email:test`.\n\n" +
      "Kalau Anda membacanya, pengaturan email sudah benar dan email persetujuan akan terkirim otomatis.",
    html:
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;">' +
      "<p><strong>Tes pengiriman email berhasil.</strong></p>" +
      "<p>Pengaturan email sudah benar. Email persetujuan dari HC Portal sekarang akan terkirim otomatis.</p>" +
      "</div>",
  });
  console.log(`  TERKIRIM. Diterima server Gmail untuk: ${info.accepted.join(", ")}`);
  console.log("  Cek inbox (dan folder Spam/Promosi) di alamat tersebut.\n");
} catch (error) {
  stop([`Login berhasil tetapi pengiriman gagal: ${error?.response ?? error?.message}`]);
}
