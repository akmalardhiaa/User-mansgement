# Deploy HC User Management di Windows Server (Node.js)

Portal berjalan sebagai **satu Windows Service**: Node.js menjalankan
`next start`, diawasi NSSM, menyala sendiri saat server boot tanpa ada yang
login. IIS di depannya menangani HTTPS dan meneruskan ke `127.0.0.1:3000`.
Koneksi ke domain controller wajib LDAPS port 636. Tidak ada container, tidak
ada database: data disimpan sebagai berkas JSON di folder `data\`.

Alur persetujuan manager → CISO tidak berubah.

## Prasyarat

- Windows Server 2019 atau 2022.
- **Node.js 22 LTS** (installer biasa), atau versi .zip yang diekstrak ke
  `C:\hc-portal\node\` bila tidak boleh memasang program.
- **NSSM** — unduh dari nssm.cc, taruh `nssm.exe` (64-bit) di
  `C:\Tools\nssm\win64\` atau di folder `deploy\windows\`.
- IIS dengan **URL Rewrite** dan **Application Request Routing (ARR)**, serta
  sertifikat HTTPS untuk nama portal.
- Jaringan dari server ke DC (LDAPS 636) dan ke relay email (SMTP).
- Akun service AD dengan hak minimum yang disetujui tim AD.

Semua perintah di bawah dijalankan di **PowerShell sebagai Administrator** dan
mengasumsikan aplikasi ada di `C:\hc-portal`. Lokasi lain juga bisa; skripnya
mencari foldernya sendiri.

## 1. Taruh aplikasi di server

Salin folder proyek ke `C:\hc-portal` — lewat `git clone`, atau salin manual
bila git tidak bisa dipakai di jaringan kantor (zip lewat flashdisk).

**Jangan ikut salin** `.env.local` atau berkas `.env*.bak-*` dari laptop. Mode
production juga membaca `.env.local`, sehingga isinya (Gmail, `localhost`)
bisa tercampur diam-diam; `install-service.ps1` menolak berjalan selama berkas
itu ada.

## 2. Ekspor CA ke PEM

1. Buka `certlm.msc` di server.
2. Cari CA internal yang menerbitkan sertifikat LDAPS domain controller.
3. Klik kanan → **All Tasks** → **Export** → **Base-64 encoded X.509 (.CER)**.
4. Simpan sebagai `C:\hc-portal\certs\corp-root-ca.pem`.

Node tidak membaca certificate store Windows, jadi CA tetap harus berupa
berkas walaupun server sudah join domain. Nama host DC di `LDAP_URL` harus sama
dengan nama di sertifikatnya — jangan pakai alamat IP.

## 3. Konfigurasi production

```powershell
Set-Location C:\hc-portal
Copy-Item deploy\windows\env.production.example .env.production.local
notepad .env.production.local
```

Ganti semua `<...>` dengan nilai dari tim AD dan infrastruktur. Path di
template sudah relatif terhadap folder aplikasi, jadi tidak perlu diubah.
Untuk awal, biarkan `AD_LDAP_WRITE_ENABLED=false`. Isi `OUTBOX_ENCRYPTION_KEY`
dengan 32 byte acak:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 4. Pasang dependensi dan build

```powershell
npm ci --include=dev
npm run build
```

**Server tidak bisa menjangkau registry npm?** Jalankan dua perintah itu di
komputer lain yang bisa — dengan `.env.production.local` yang sama, karena nama
dan logo brand ikut tertanam saat build — lalu salin folder aplikasi beserta
`node_modules` dan `.next` ke server. Update berikutnya memakai
`update-portal.ps1 -SkipInstall`.

## 5. Uji AD hanya-baca

Skrip ini membaca `.env.production.local` bila `NODE_ENV=production`, dan tidak
pernah menulis apa pun ke AD:

```powershell
$env:NODE_ENV = "production"
npm run ad:check -- nama.akun.anda
npm run ad:service-check -- akun.di.ou.kelola
Remove-Item Env:NODE_ENV
```

`ad:check` menanyakan password secara tersembunyi; jangan menuliskannya sebagai
argumen. Jangan lanjut sebelum CA, bind, base DN, OU, dan group semuanya benar.

## 6. Pasang Windows Service

```powershell
.\deploy\windows\install-service.ps1
```

Skrip ini:

- memasang service `HCUserManagement` lewat NSSM (`next start` di
  `127.0.0.1:3000`, menyala otomatis saat boot, restart sendiri bila mati,
  log berputar di `logs\`);
- menjalankannya sebagai **akun virtual** `NT SERVICE\HCUserManagement` — tidak
  ada password service sama sekali, karena AD dan SMTP memakai kredensial dari
  `.env.production.local`;
- membatasi hak akses: `data\`, `logs\`, `certs\`, dan `.env.production.local`
  hanya bisa dibaca service itu, Administrators, dan SYSTEM.

Boleh dijalankan ulang; service yang sudah ada dikonfigurasi ulang, bukan
dipasang dua kali. Setelah mengubah `.env.production.local`:
`Restart-Service HCUserManagement`.

Bila `USER_FOLDER_ROOT` menunjuk ke share (`\\server\...`), service mengaksesnya
sebagai akun komputer server ini — beri akun komputer itu hak Modify di share.

## 7. IIS sebagai pintu HTTPS

1. Pasang sertifikat dan binding HTTPS untuk nama DNS portal.
2. Salin `deploy\windows\web.config` ke root situs IIS; ganti contoh host
   `hc.example.internal` dengan nama sebenarnya.
3. Jalankan perintah `appcmd` yang tertulis sebagai komentar di `web.config`
   (ARR proxy, `preserveHostHeader`, `HTTP_X_FORWARDED_PROTO`).
4. Port 3000 tidak pernah dibuka ke jaringan; service hanya mendengarkan
   `127.0.0.1`.

`APP_BASE_URL` harus alamat https itu, karena setiap tautan persetujuan di
email dibangun darinya.

## 8. Verifikasi, lalu nyalakan penulisan

1. Buka `https://<nama-portal>/status-ad` dengan akun yang punya izin
   `execution.run`. CA, bind, base DN, OU kelola, OU karantina, group peran, dan
   group CISO harus hijau.
2. Isi `AD_MANAGED_OUS` hanya dengan OU uji dan OU karantina uji, set
   `AD_LDAP_WRITE_ENABLED=true`, isi `EMAIL_REDIRECT_TO` dengan alamat penguji,
   lalu `Restart-Service HCUserManagement`.
3. Jalankan satu Onboarding sampai selesai dan periksa hasilnya di **Active
   Directory Users and Computers**.
4. Setelah disetujui, ganti ke OU production dan kosongkan `EMAIL_REDIRECT_TO`.

## 9. Backup dan restore

```powershell
.\deploy\windows\backup-data.ps1
```

Service dihentikan beberapa detik, `data\` di-zip ke
`backups\hc-data-<waktu>.zip`, service dinyalakan lagi; arsip lebih dari 30 hari
dihapus. Contoh pendaftaran harian di Task Scheduler ada di akhir skrip.

**Restore:** `Stop-Service HCUserManagement`, ekstrak zip ke `data\` (timpa),
`Start-Service HCUserManagement`. Backup berisi data karyawan dan sesi: simpan
salinannya di media terpisah dengan akses terbatas.

## 10. Update aplikasi

Salin versi baru ke `C:\hc-portal` **tanpa menimpa** `.env.production.local`,
`certs`, `data`, `logs`, dan `backups` (atau biarkan `git pull` bila folder itu
checkout git), lalu:

```powershell
.\deploy\windows\update-portal.ps1            # npm ci + build
.\deploy\windows\update-portal.ps1 -SkipInstall  # node_modules sudah disalin
```

Urutannya: stop → backup data → `npm ci` → build → start → cek. Bila build gagal,
versi sebelumnya dipulihkan dan service dinyalakan lagi — portal tidak ditinggal
mati.

## Batas yang tidak boleh dilanggar

- **Hanya satu instance.** Worker, outbox, dan kunci store berada di satu proses;
  dua instance pada `data\` yang sama bisa menjalankan pekerjaan yang sama dua
  kali atau mengirim email persetujuan ganda. Jangan menjalankan `jalankan.bat`
  di server yang service-nya hidup.
- **Kecualikan `data\` dari pemindaian antivirus real-time** bila tim keamanan
  mengizinkan. Store menulis lewat rename atomik; berkas yang dikunci pemindai
  sesaat bisa menggagalkan satu penyimpanan.
- Semua skrip di folder ini ditulis untuk Windows PowerShell 5.1 (bawaan Windows
  Server) dan memanggil program luar lewat `common.ps1`, supaya pesan biasa di
  stderr (npm, nssm, git) tidak menghentikan skrip.
