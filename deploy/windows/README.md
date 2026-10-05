# Deploy HC User Management di Windows Server

Panduan ini memasang satu instance aplikasi Next.js pada Windows Server. Node.js
berjalan sebagai Windows Service melalui NSSM; IIS menangani HTTPS dan
reverse-proxy ke `127.0.0.1:3000`. Koneksi ke Active Directory harus memakai
LDAPS pada port 636.

## Prasyarat

- Windows Server yang bergabung atau memiliki jalur jaringan ke domain kantor.
- Node.js LTS yang didukung proyek, npm, IIS URL Rewrite, IIS ARR, dan NSSM.
- Sertifikat TLS untuk nama HTTPS portal, serta sertifikat CA internal yang
  menerbitkan sertifikat domain controller.
- Akun service AD khusus dengan hak minimum yang disetujui tim AD.
- Hak lokal **Log on as a service** untuk akun Windows service.
- Satu direktori aplikasi dan satu volume/folder backup yang persisten.
- Satu instance aplikasi saja. Store JSON, sesi, outbox, dan worker tidak
  dirancang untuk beberapa proses atau beberapa server yang menulis bersamaan.

Jalankan PowerShell sebagai Administrator untuk pemasangan service, ACL, dan
IIS. Pengisian konfigurasi serta uji AD harus dikoordinasikan dengan tim AD.

## 1. Ekspor CA ke PEM

1. Buka `certlm.msc`.
2. Temukan CA internal yang menerbitkan sertifikat LDAPS DC (umumnya di
   **Trusted Root Certification Authorities** atau **Intermediate Certification
   Authorities**).
3. Klik kanan sertifikat CA → **All Tasks** → **Export**.
4. Pilih **Base-64 encoded X.509 (.CER)** dan simpan hasilnya, misalnya sebagai
   `C:\HC\UserManagement\certs\corp-ca.cer`.
5. Bila nama ekstensi perlu `.pem`, ubah nama file menjadi `.pem`; isi Base-64
   X.509 yang sama adalah PEM yang dibaca Node.js.

Node.js tidak membaca Windows certificate store untuk koneksi LDAP. Isi
`LDAP_CA_CERT_PATH` dengan path berkas biasa, misalnya
`C:\HC\UserManagement\certs\corp-ca.pem`. Pastikan nama host pada
`AD_LDAP_URL`/`LDAP_URL` cocok dengan sertifikat DC.

## 2. Siapkan aplikasi dan environment

Salin repository ke lokasi tetap, misalnya `C:\HC\UserManagement`, lalu:

```powershell
Set-Location C:\HC\UserManagement
npm ci
npm run build
Copy-Item deploy\windows\env.production.example .env.production.local
```

Lengkapi `.env.production.local` memakai nilai yang diberikan tim AD,
infrastruktur, dan pemilik proses. Jangan commit atau mengirim file environment
yang berisi rahasia. Awali dengan `AD_LDAP_WRITE_ENABLED=false`. Isi
`AD_MANAGED_OUS`, `AD_QUARANTINE_OU`, OU profil, group peran, dan konfigurasi
email secara konsisten; buat `OUTBOX_ENCRYPTION_KEY` dengan 32 byte acak yang
di-Base64-kan.

## 3. Uji koneksi hanya-baca

Di PowerShell pada direktori aplikasi, set production lalu jalankan dua uji:

```powershell
$env:NODE_ENV = "production"
npm run ad:check -- <akun-uji-AD>
npm run ad:service-check -- <sAMAccountName-uji>
```

`ad:check` menguji login sebagai akun uji. `ad:service-check` menguji bind
akun service, pembacaan akun, serta group CISO bila dikonfigurasi. Keduanya
hanya membaca AD; masukkan kata sandi saat diminta di terminal, jangan sebagai
argumen perintah. Jangan lanjut bila TLS, bind, base DN, OU, atau hasil
pembacaan tidak benar.

## 4. Pasang Windows Service

Pastikan `.next\BUILD_ID` dan `.env.production.local` sudah ada, lalu jalankan
skrip sebagai Administrator:

```powershell
.\deploy\windows\install-service.ps1
```

Skrip menyiapkan `data`, `certs`, dan `logs` dengan ACL terbatas, mendaftarkan
`next start -H 127.0.0.1 -p 3000` lewat NSSM, mengaktifkan start otomatis,
rotasi log, dan restart setelah proses berhenti. Nama akun service diminta oleh
skrip; NSSM meminta kata sandinya secara interaktif dan kata sandi tidak
disimpan di skrip. Jangan jalankan service dengan akun Administrator.

## 5. Pasang IIS reverse proxy HTTPS

1. Instal binding HTTPS pada situs IIS untuk nama DNS portal dan pasang
   sertifikat TLS yang sesuai.
2. Instal IIS URL Rewrite dan Application Request Routing (ARR).
3. Salin `deploy\windows\web.config` ke root situs IIS. Ganti `hc.example.internal`
   di rule redirect dengan nama DNS portal.
4. Jalankan perintah `appcmd` yang tercantum sebagai komentar di `web.config`
   untuk mengaktifkan proxy ARR, `preserveHostHeader`, dan mengizinkan
   `HTTP_X_FORWARDED_PROTO`.
5. Verifikasi situs hanya dapat dicapai lewat HTTPS dan meneruskan ke
   `http://127.0.0.1:3000`.

Jangan expose port 3000 ke jaringan. Firewall hanya perlu mengizinkan HTTPS ke
IIS dan LDAPS 636 dari server aplikasi menuju DC yang disetujui.

## 6. Verifikasi dan aktifkan penulisan

- Buka `https://<nama-portal>/status-ad` dengan akun portal berizin
  `execution.run`. Status diagnostik menunjukkan konfigurasi, CA, bind, DN,
  OU, dan mode tulis.
- Pastikan hasil `ad:check` dan `ad:service-check` juga berhasil.
- Uji alur approval yang sudah berlaku di lingkungan uji; approval manager lalu
  CISO tetap menjadi prasyarat eksekusi.
- Setelah pemilik AD menyetujui OU dan hak akun service, ubah
  `AD_LDAP_WRITE_ENABLED=true`, lalu restart service. Mulai dengan satu OU
  pilot yang termasuk `AD_MANAGED_OUS`.
- Pantau Windows Event Viewer, log NSSM, IIS, dan halaman `/status-ad`.

## Backup data

Store JSON, sesi, serta outbox berada di bawah `data` kecuali path environment
diubah. Jalankan:

```powershell
.\deploy\windows\backup-data.ps1
```

Skrip membuat ZIP bertimestamp, menghapus arsip lebih lama dari 30 hari, dan
menyediakan contoh pendaftaran Task Scheduler. Uji pemulihan backup secara
berkala. Simpan backup di lokasi terpisah yang juga dibatasi ACL; backup berisi
data pegawai dan sesi.

## Update aplikasi

1. Pastikan backup baru tersedia.
2. Hentikan service dari Services atau `nssm stop HCUserManagement`.
3. Perbarui source ke versi yang disetujui, jalankan `npm ci`, lalu
   `npm run build`.
4. Jangan menimpa `.env.production.local`, `data`, `certs`, atau `logs`.
5. Jalankan uji service-check bila ada perubahan koneksi atau izin AD.
6. Mulai service dan verifikasi `/status-ad`, login, worker, dan IIS.
7. Bila update gagal, pulihkan paket aplikasi sebelumnya dan backup data yang
   konsisten.

Jangan menjalankan dua instance, bahkan sementara saat update atau uji coba.
Penjadwal worker dan store berkas JSON mengasumsikan satu proses penulis.
