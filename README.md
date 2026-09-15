# HC User Management Dashboard

Portal Human Capital untuk mengelola akun karyawan dengan persetujuan melalui email.

## Alur persetujuan

1. HC mengajukan akun baru atau perubahan posisi.
2. Manager menerima email berisi tautan untuk menyetujui atau menolak.
3. Jika disetujui, Tim IT Security menerima email untuk menyiapkan akses.
4. Tim IT Security menandai pekerjaan selesai dari tautan email. Akun kemudian aktif, atau perubahan posisi diterapkan.

Setiap tautan keputusan menggunakan token acak, sekali pakai, dan memiliki masa berlaku. Manager dan Tim IT Security tidak perlu memiliki akun portal.

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local
npm run db:migrate
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=your-password ADMIN_NAME="Admin HC" npm run db:seed
npm run dev
```

Isi minimal `.env.local`:

- `DATABASE_URL` dan `JWT_SECRET` untuk sistem akun.
- `EMAIL_SERVICE`, kredensial email, dan `EMAIL_FROM` untuk pengiriman email sungguhan.
- `SECURITY_TEAM_EMAIL` sebagai inbox bersama tim yang menyiapkan akses.
- `APP_BASE_URL` atau `NEXT_PUBLIC_API_URL` dengan URL publik aplikasi agar tautan email dapat dibuka.

Di lingkungan development, `EMAIL_SERVICE` boleh dikosongkan. Email dicatat ke server log agar tautannya dapat diuji tanpa SMTP. Konfigurasi itu ditolak pada production agar email tidak hilang diam-diam.

## Halaman utama

| Route | Fungsi |
| --- | --- |
| `/` | Direktori karyawan dan perubahan akses langsung |
| `/users/new` | Pengajuan akun baru |
| `/requests` | Status pengajuan dan jejak audit |
| `/approvals/[token]` | Halaman keputusan dari tautan email |
| `/login` | Masuk ke portal |
| `/dashboard` | Administrasi akun portal |

## API persetujuan

| Method | Route | Fungsi |
| --- | --- | --- |
| `POST` | `/api/users` | Membuat pengajuan akun baru dan mengirim email manager |
| `POST` | `/api/users/:id/transfer` | Membuat pengajuan perubahan posisi dan mengirim email manager |
| `POST` | `/api/approvals/:token` | Mencatat keputusan manager atau konfirmasi IT Security |
| `GET` | `/api/requests` | Mengambil seluruh pengajuan dan jejak audit |

Keputusan dikirim sebagai `POST`, bukan saat tautan dibuka, agar pemindai email atau pratinjau tautan tidak dapat menyetujui pengajuan secara otomatis.

## Catatan keamanan

- Gunakan inbox bersama untuk `SECURITY_TEAM_EMAIL`, bukan alamat personal.
- Pastikan `APP_BASE_URL` memakai domain HTTPS publik pada production.
- Tautan yang kedaluwarsa atau sudah dipakai tidak bisa digunakan kembali.
- Sebelum dipakai untuk data sensitif, tambahkan SSO/MFA, rate limiting bersama, dan kontrol peran untuk seluruh rute HC.

## Perintah

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run db:migrate
npm run db:deploy
npm run db:seed
```