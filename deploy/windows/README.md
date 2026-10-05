# Deploy HC User Management di Podman Windows

Production menjalankan satu container Linux di Podman machine (WSL2); IIS
menangani HTTPS dan meneruskan request ke `127.0.0.1:3000`. Koneksi ke domain
controller wajib memakai LDAPS port 636. Alur approval manager → CISO tetap
berjalan di aplikasi dan tidak berubah.

## Prasyarat

- Windows Server 2022 dengan WSL2 dan virtualisasi diaktifkan. Windows Server
  2019 tidak didukung untuk prosedur Podman machine/WSL2 ini.
- Podman Desktop/Podman CLI untuk Windows dan provider `podman compose`.
- IIS URL Rewrite, Application Request Routing (ARR), dan sertifikat HTTPS
  untuk nama portal.
- Jaringan ke DNS kantor dan DC LDAPS, serta akun service AD dengan hak
  minimum yang disetujui tim AD. Git opsional: proyek boleh disalin manual.
- Satu akun Windows khusus/terkelola yang memiliki Podman machine. Jangan
  menjalankan machine sebagai SYSTEM; machine Podman bersifat per-user.
- Ruang disk untuk image, volume JSON, dan backup. Hanya satu instance portal.

## 1. Pasang Podman dan siapkan lokasi

Pasang WSL2 dan Podman sesuai panduan resmi untuk Windows Server 2022. Buka
PowerShell sebagai akun Windows yang akan menjalankan machine:

```powershell
podman machine init
podman machine start
podman info
```

Taruh proyek di `C:\hc-portal` atau lokasi tetap lain: `git clone`, atau salin
foldernya secara manual bila git tidak bisa dipakai di jaringan kantor. Yang
perlu ikut hanya kode sumbernya. `node_modules`, `.next`, `data`, dan berkas
`.env` dari komputer lain tidak dipakai: image memasang dependensinya sendiri,
dan konfigurasi production dibuat di server. Perintah di bawah mengasumsikan
`C:\hc-portal`. Pastikan `podman info` berhasil dari akun yang
sama sebelum melanjutkan. Jangan menginisialisasi/menjalankan machine sebagai
akun lain atau SYSTEM.

## 2. Ekspor CA ke PEM

1. Buka `certlm.msc`.
2. Temukan CA internal yang menerbitkan sertifikat LDAPS DC.
3. Klik kanan → **All Tasks** → **Export**.
4. Pilih **Base-64 encoded X.509 (.CER)**; simpan sebagai
   `C:\hc-portal\certs\corp-root-ca.pem`.
5. Pastikan folder `certs` berada di samping `compose.production.yml`.

Node.js di container tidak membaca Windows certificate store. Sertifikat
tersebut di-mount read-only sebagai `/run/certs/corp-root-ca.pem`; nilai
`LDAP_CA_CERT_PATH` di template sudah menunjuk ke path container itu. Nama host
DC di `LDAP_URL`/`AD_LDAP_URL` harus cocok dengan sertifikat.

## 3. Environment dan image

```powershell
Set-Location C:\hc-portal
Copy-Item deploy\windows\env.production.example .env.production.local
```

Ganti placeholder `<...>` dengan nilai yang disetujui AD, infrastruktur, dan
pemilik proses. Jangan commit `.env.production.local`, jangan masukkan secret
ke image, dan jangan menyalin konfigurasi production ke `.env`. Pastikan
`OUTBOX_ENCRYPTION_KEY` berisi 32 byte acak dalam Base64; buat dengan:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Jaga `AD_LDAP_WRITE_ENABLED=false` saat uji. Build image production:

```powershell
podman compose --env-file .env.production.local -f compose.production.yml build
```

Build memakai multi-stage Node 22, hanya membawa output Next, dependency
production, `public`, konfigurasi Next, dan skrip pemeriksaan ke runtime. Nama
brand dan logo yang bersifat publik dibaca sebagai build args dari env file;
secret lainnya tidak diteruskan sebagai build args. `ldapts` dan `@next/env`
berasal dari dependency production; skrip pemeriksaan tidak memerlukan
devDependencies. Image menjalankan user non-root, dan `.containerignore` serta
`.dockerignore` mengecualikan `.env*` dan data lokal. Containerfile/compose
development tidak diubah.

### Tanpa git atau tanpa akses npm

Build di atas mengunduh dependensi dari registry npm. Bila server tidak bisa
menjangkaunya, build image di komputer lain yang bisa, lalu bawa hasilnya:

```powershell
podman build -f Containerfile.production -t hc-portal:latest `
  --build-arg NEXT_PUBLIC_BRAND_NAME="<nama-perusahaan>" `
  --build-arg NEXT_PUBLIC_BRAND_LOGO="/brand/<logo-perusahaan>.png" .
podman save -o hc-portal-image.tar hc-portal:latest
```

Dua nilai brand itu satu-satunya yang tertanam di image; tidak ada rahasia yang
perlu ada di komputer pembangun. Salin `hc-portal-image.tar` bersama folder
proyek, lalu di server muat image itu sebagai pengganti langkah build:

```powershell
podman load -i D:\hc-portal-image.tar
```

Untuk update berikutnya, `.\deploy\windows\update-portal.ps1 -ImageArchive
D:\hc-portal-image.tar` memuat arsip itu alih-alih membangun.

### Uji DNS dari container

Container harus dapat resolve FQDN domain controller:

```powershell
podman compose -f compose.production.yml run --rm portal node -e "require('dns').lookup('<dc>',console.log)"
```

Jika lookup gagal, periksa resolver yang dipakai machine:

```powershell
podman machine ssh -- cat /etc/resolv.conf
```

Minta alamat DNS kantor dari tim infrastruktur. Utamakan memperbaiki DNS pada
adapter Windows/VPN yang dipakai WSL2, lalu jalankan `podman machine stop` dan
`podman machine start`. Jika kebijakan mengharuskan resolver khusus di machine,
tim Linux dapat menonaktifkan pembuatan otomatis resolver di `/etc/wsl.conf`
dengan bagian berikut:

```ini
[network]
generateResolvConf=false
```

Untuk resolver khusus, jalankan dari PowerShell sebagai akun pemilik machine,
ganti placeholder dengan DNS yang diberikan tim infrastruktur:

```powershell
podman machine ssh
```

Di shell Linux machine, jalankan:

```sh
sudo sh -c 'printf "[network]\ngenerateResolvConf=false\n" > /etc/wsl.conf'
sudo sh -c 'printf "nameserver <alamat-DNS-kantor>\n" > /etc/resolv.conf'
exit
```

Setelah kembali ke PowerShell:

```powershell
podman machine stop
podman machine start
```

Perubahan manual itu persisten di filesystem Podman machine dan perlu dikelola
bersama konfigurasi infrastruktur. Jangan menanam alamat IP DC ke konfigurasi
LDAP sebagai jalan pintas: TLS memeriksa nama host sertifikat.

## 4. Uji AD hanya-baca

Image mengatur `NODE_ENV=production`, dan `env_file` compose memuat
`.env.production.local`. Jalankan dari terminal interaktif:

```powershell
podman compose -f compose.production.yml run --rm portal npm run ad:check -- <user>
podman compose -f compose.production.yml run --rm portal npm run ad:service-check -- <sAMAccountName>
```

`ad:check` meminta password login secara tersembunyi di terminal. Jangan
menambahkan password sebagai argumen command: itu dapat terlihat di riwayat
shell/process list, dan skrip memang tidak membutuhkannya sebagai argumen.
`ad:service-check` membaca konfigurasi akun service dari env file. Skrip
diagnostik hanya membaca AD. Jangan lanjut bila CA, bind, base DN, OU, atau
hasil uji tidak benar.

## 5. Jalankan container dan daftarkan startup

CA file, `.env.production.local`, dan image harus sudah tersedia:

```powershell
podman compose -f compose.production.yml up -d
podman compose -f compose.production.yml ps
```

Port container hanya dipublish pada `127.0.0.1:3000`; volume bernama `hc-data`
menyimpan JSON, sesi, outbox, dan folder karyawan pada filesystem Linux
Podman machine. Jangan menggantinya dengan bind mount ke disk Windows: store
mengandalkan rename atomik.

Untuk mulai otomatis setelah Windows boot, buka PowerShell sebagai
Administrator pada akun Windows pemilik Podman machine, lalu:

```powershell
.\deploy\windows\register-startup-task.ps1
```

Masukkan akun pemilik machine dan password saat diminta. Password diberikan ke
Task Scheduler agar task dapat berjalan saat pengguna tidak login; password
tidak ditulis ke skrip. Task memanggil `start-portal.ps1`, yang mencoba
menyalakan machine, menunggu `podman info`, menjalankan compose secara
idempoten, dan mencatat log ke folder `logs` di samping aplikasi
(`C:\hc-portal\logs`).

Uji sekali dengan **me-restart server tanpa login**: portal harus kembali
menjawab dengan sendirinya. Bila tidak, `logs\start-portal.log` menyebut
langkah yang gagal. Uji ini wajib karena task berjalan tanpa sesi pengguna,
dan WSL2 di keadaan itu hanya bisa dibuktikan di server itu sendiri.

## 6. IIS HTTPS reverse proxy

1. Pasang sertifikat dan binding HTTPS IIS untuk nama DNS portal.
2. Instal URL Rewrite dan ARR.
3. Salin `deploy\windows\web.config` ke root situs IIS dan ubah host contoh
   `hc.example.internal` ke nama DNS yang sebenarnya.
4. Jalankan perintah `appcmd` yang tercantum sebagai komentar di `web.config`
   untuk mengaktifkan ARR proxy, `preserveHostHeader`, dan mengizinkan
   `HTTP_X_FORWARDED_PROTO`.
5. Jangan expose port 3000 ke jaringan; arahkan IIS ke
   `http://127.0.0.1:3000`.

## 7. Verifikasi dan aktifkan penulisan

- Login ke portal lalu buka `https://<nama-portal>/status-ad` dengan role yang
  memiliki `execution.run`.
- Pastikan pemeriksaan CA, bind, base DN, OU kelola, quarantine OU, role groups,
  dan CISO sesuai konfigurasi.
- Pastikan dua skrip uji AD berhasil dan email/outbox production siap.
- Alur manager → CISO tetap wajib sebelum worker menjalankan perubahan.
- Setelah pemilik AD menyetujui akun service dan OU, set
  `AD_LDAP_WRITE_ENABLED=true` di `.env.production.local`, lalu
  `podman compose -f compose.production.yml up -d`.
- Mulai dari pilot OU yang tercantum di `AD_MANAGED_OUS`; pantau halaman
  `/status-ad`, log container, IIS, dan event Windows.

## Backup dan restore

`backup-data.ps1` menghentikan portal sementara agar ekspor volume konsisten,
menghasilkan arsip tar bertimestamp di folder `backups` di samping aplikasi
(ubah dengan `-BackupPath`, misalnya ke disk lain), menyalakan kembali portal,
dan menghapus arsip lebih lama dari 30 hari:

```powershell
.\deploy\windows\backup-data.ps1
```

Skrip menyertakan contoh pendaftaran Task Scheduler harian. Untuk restore:

1. Hentikan portal: `podman compose -f compose.production.yml down`.
2. Simpan salinan volume saat ini atau ekspor kondisi saat ini terlebih dahulu.
3. Hapus volume `hc-data` hanya setelah memastikan arsip dan lokasi yang dipilih
   benar, lalu buat kembali: `podman volume rm hc-data` dan
   `podman volume create hc-data`.
4. Import arsip: `podman volume import hc-data C:\hc-portal\backups\hc-data-<timestamp>.tar`.
5. Jalankan `podman compose -f compose.production.yml up -d` dan verifikasi
   login, `/status-ad`, data, serta antrean.

Backup berisi data pegawai dan sesi; lindungi ACL dan salin ke media terpisah.
Uji restore berkala di lingkungan terisolasi.

## Update aplikasi

Jalankan sebagai akun pemilik Podman machine:

```powershell
.\deploy\windows\update-portal.ps1
```

Bila folder aplikasi adalah checkout git, skrip menjalankan `git pull`. Bila
proyek disalin manual, salin dulu versi barunya ke folder yang sama, tanpa
menimpa `.env.production.local`, `certs`, `logs`, atau `backups`. Skrip lalu
menyalakan/memeriksa Podman machine, build image production memakai
`.env.production.local` untuk build args brand (atau memuat arsip dengan
`-ImageArchive`), memperbarui container, dan menampilkan status compose serta
healthcheck.

Semua skrip di folder ini ditulis untuk Windows PowerShell 5.1 — versi yang
dipakai Task Scheduler — dan memanggil `podman` lewat `podman-common.ps1`,
supaya pesan biasa podman di stderr seperti "already running" tidak
menghentikan skrip. Pastikan backup terbaru
sebelum update. Jangan menimpa `.env.production.local`, `certs`, atau volume
`hc-data`. Bila gagal, pulihkan versi aplikasi sebelumnya dan data dari backup
yang konsisten.

## Batas deployment

Hanya satu container/instance portal boleh berjalan terhadap volume `hc-data`.
Worker, outbox, dan penguncian store JSON berada dalam satu proses; beberapa
instance dapat memproses pekerjaan yang sama atau merusak konsistensi berkas.
Jangan scale service, menjalankan container kedua untuk update, atau
menghubungkan volume yang sama dari host lain.
