# HC User Management Dashboard

Portal Human Capital: direktori karyawan dengan login Active Directory.

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Tanpa `LDAP_URL`, portal memakai akun demo lokal di `src/lib/auth/devUsers.ts`:

| Username | Kata sandi | Peran portal | Catatan |
| --- | --- | --- | --- |
| `admin` | `admin12345` | Administrator sistem + Human Capital | **Satu-satunya yang bisa masuk** |
| `dimas` | `dimas12345` | *(tidak ada)* | Manager sebagian besar karyawan seed — login **ditolak** |
| `sarah` | `sarah12345` | *(tidak ada)* | Manager divisi IT — Engineering — login **ditolak** |
| `bagus` | `bagus12345` | *(tidak ada)* | Approver CISO demo — login **ditolak** |
| `budi` | `budi12345` | *(tidak ada)* | Login **ditolak** |
| `rina` | `rina12345` | *(tidak ada)* | Akun AD valid tanpa wewenang portal — login **ditolak** |

**Portal hanya untuk HC.** Manager dan tim CISO tidak masuk ke portal sama
sekali: mereka menyetujui dari email yang mereka terima, lewat tautan sekali
pakai yang terikat ke alamat mereka sendiri. Akun di atas tetap ada sebagai akun
direktori yang sah tanpa peran portal, sehingga mencoba masuk dengan salah
satunya menunjukkan persis apa yang dilihat manager di production — penolakan
yang menyuruhnya memakai email. `dimas` dan `sarah` tetap penting karena alamat
merekalah yang tercatat sebagai manager di direktori seed, jadi ke sanalah email
persetujuan demo dirutekan.

Akun demo ditolak di production: di sana `LDAP_URL` yang belum diisi adalah
kesalahan konfigurasi, bukan alasan untuk meloloskan siapa pun.

### Masuk lewat direktori simulasi

Pilihan tengah antara daftar di atas dan AD sungguhan, dan alasan memilihnya
bukan kenyamanan: peran diambil dari **keanggotaan group** tiap akun, lewat
`rolesFromGroups` yang sama persis dengan yang membaca `memberOf` dari domain
controller. `devUsers.ts` menuliskan peran per akun, jadi login lewat daftar itu
tidak pernah sekali pun menjalankan pemetaan yang menentukan wewenang di
deployment sungguhan — salah isi `AD_GROUP_*` baru ketahuan pada hari AD asli
dihubungkan.

```bash
MOCK_AD_LOGIN=true
MOCK_AD_PASSWORD=mock12345
```

Direktori hasil seed hanya membawa group **akses** (`CN=HC-Base`), bukan group
**peran**. Tanpa langkah berikut semua akun masuk tanpa wewenang apa pun dan
hanya melihat profilnya sendiri — benar, bukan rusak:

```bash
npm run mock-ad:roles          # beri group peran ke tiga akun
npm run mock-ad:roles -- --undo  # kembalikan tepat yang ditambahkannya
npm run mock-ad:roles -- --super # satu akun memegang seluruh peran portal
```

| Akun | Peran yang didapat |
| --- | --- |
| `ayu.prameswari` | `HC_REQUESTER` + `SYSTEM_ADMIN` |
| `sarah.wijaya` | *(tidak ada — group manager tidak lagi memberi peran portal)* |
| `bagus.nugroho` | *(tidak ada — group CISO tidak lagi memberi peran portal)* |

DN yang ditulis dibaca dari `AD_GROUP_*`, jadi direktori dan konfigurasi cocok
secara konstruksi. Nama yang tidak dikenal direktori simulasi **jatuh ke daftar
demo di atas**, sehingga menyalakan ini tidak pernah mengunci siapa pun keluar.
Akun yang dinonaktifkan tidak bisa masuk — itulah yang membuat Termination
terlihat utuh: login berhenti bekerja sebagai *akibat* pengajuan, bukan sebagai
langkah terpisah yang harus diingat seseorang. **Ditolak di production.**

## Menjalankan tanpa container

Untuk menjalankan lokal tanpa container, aplikasi ini hanya memerlukan Node.js.
Klik dua kali `jalankan.bat`, atau jalankan perintah terminal di bawah.

```bash
npm install     # sekali saja
npm run dev
```

Lalu buka `http://localhost:3000`. Hasilnya identik dengan container, karena
`.env.development` — ikut di-commit, tanpa rahasia — memuat bawaan yang sama
dengan `.env.development`, dan `.env.local` Anda tetap menimpanya.

**Bila komputernya tidak boleh memasang apa pun,** unduh Node.js versi
*Windows Binary (.zip)* dari nodejs.org, ekstrak ke folder `node` di dalam
folder proyek, lalu jalankan `jalankan.bat` — skrip itu memakai Node portabel
tersebut tanpa pemasangan dan tanpa hak admin.

**Bila jaringannya memblokir npm,** salin folder `node_modules` (sekitar 550 MB)
dari komputer yang sudah menjalankan `npm install`. Salinan antar-Windows
kompatibel, dan `npm install` lalu tidak diperlukan sama sekali.

Untuk mode container, yang dipasang hanya Podman CLI — tidak ada aplikasi
desktop seperti Docker Desktop, dan tidak ada lisensi.

## Menjalankan dengan Podman

```bash
podman compose up
```

Lalu buka `http://localhost:3000`. Satu perintah itu memang seluruh ceritanya,
dan dua hal menjaganya tetap begitu.

Pasang Podman sekali dengan `winget install -e --id RedHat.Podman` — itu CLI
saja, bukan aplikasi desktop. Mesin Podman dan `podman-compose` dibuat sendiri
oleh **`jalankan-podman.bat`**, jadi untuk pemakaian sehari-hari klik dua kali
berkas itu dan lewati perintah di atas. Image dibangun dari `Containerfile`,
dengan konfigurasi di `compose.yaml`. Urutan lengkapnya ada di MENJALANKAN.md.

**Konfigurasi bertumpuk dua lapis.** `env_file` membaca
`.env.development` — yang ikut di-commit, berisi bawaan demo, tanpa rahasia —
lalu `.env.podman` yang **opsional** dan menimpa nilai apa pun yang diisinya.
Hasilnya: hasil `git clone` yang belum punya `.env.podman` tetap menyala dengan
direktori simulasi dan email ditulis ke berkas, sedangkan mesin yang sudah
mengisi SMTP tetap memakai SMTP. Untuk salinan baru, jalankan
`Copy-Item .env.development .env.podman`, lalu isi placeholder rahasia di
dalamnya.

**Kode di-mount, jadi mengubah berkas tidak perlu `--build`.** Yang tidak
di-mount hanya `node_modules` dan `.next`: yang pertama dipasang `npm ci` di
dalam image dan harus tetap versi Linux, yang kedua milik siapa pun yang sedang
menjalankan. Pemantau berkas Next **tidak** menerima notifikasi perubahan dari
folder Windows lewat bind mount, jadi hot reload tidak menyala di Windows —
hentikan (`Ctrl+C`) lalu `podman compose up` lagi, dan kode baru langsung
terpakai. `podman compose up` pada container yang masih hidup tidak melakukan
apa-apa, jadi menghentikannya dulu bukan langkah opsional.

`--build` hanya perlu ketika `package.json` atau lockfile berubah, karena
dependency dipasang ke dalam image, bukan di-mount.

**Run pertama mengisi dirinya sendiri.** Direktori karyawan sudah punya data
awal, tetapi direktori simulasi dulu mulai kosong — dan setiap Movement atau
Termination untuk karyawan bawaan gagal pada akun yang tidak pernah dibuat.
Perbaikannya sebelumnya adalah memanggil `POST /api/admin/seed-mock-ad` sendiri,
yang wajar bila Anda tahu itu ada dan jadi jebakan bila Anda baru menyalin
repositori ini. Kini `src/lib/ad/bootstrapMockAd.ts` melakukannya saat boot
pertama: satu akun per karyawan, tertaut lewat `objectGUID`, aktif mengikuti
status karyawan — lalu satu group role (`AD_GROUP_HC`) diberikan ke akun
Human Capital, sehingga halaman login yang mengundang akun Active Directory
tidak menolak semuanya. Dua syarat, dan keduanya penting: driver harus yang
simulasi, dan berkas direktorinya belum ada. Berkas yang ada tapi kosong adalah
keadaan demo milik seseorang — mungkin akun sengaja dihapus untuk menunjukkan
kegagalan — dan memulihkannya diam-diam adalah kejutan tersendiri.

### Pindah ke komputer lain

Dua jalur, dan keduanya tidak butuh langkah seeding apa pun. Tanpa container:
salin folder proyek beserta `node_modules`, lalu `jalankan.bat` — lihat
**Menjalankan tanpa container** di atas, yang juga jalan tanpa hak admin dan
tanpa koneksi. Dengan Podman, yang perlu dipasang hanya **Podman CLI**
(`winget install -e --id RedHat.Podman`); mesin dan Compose disiapkan oleh
`jalankan-podman.bat`, dan Node.js tidak perlu dipasang di host.

**Mulai bersih** — salin repositori ini (tanpa `node_modules` dan `.next`), lalu:

```bash
podman compose up
```

Data terbentuk sendiri: enam karyawan, satu akun direktori simulasi untuk
masing-masing, dan login lewat akun Active Directory simulasi
(`ayu.prameswari` / `mock12345`). Akun manager seperti `sarah.wijaya` ditolak,
karena portal ini memang hanya untuk Human Capital.

**Membawa data yang sudah ada** — matikan dulu portal di komputer lama
(`podman compose down`) supaya tidak ada yang sedang menulis, salin folder
`data/` apa adanya, lalu jalankan perintah yang sama. Berkas `*.tmp` dan
`*.bak-*` di dalamnya sisa lama dan tidak perlu ikut. Jangan menyalakan
keduanya bersamaan: dua penjadwal outbox pada data yang sama berarti satu email
persetujuan terkirim dua kali.

**Folder per karyawan baru mengikuti konfigurasi, bukan nama komputer.** Setiap
akun yang selesai dibuat mendapat satu folder berisi ringkasan data yang
disetujui, di bawah `USER_FOLDER_ROOT`. Lewat Podman itu sudah diatur:
`compose.yaml` memetakan folder **di atas** proyek, jadi di komputer mana
pun foldernya muncul di sebelah folder proyek tanpa mengubah apa-apa. Tanpa
container, isi `USER_FOLDER_ROOT` di `.env.local` dengan path Windows biasa.
Dibiarkan kosong, fiturnya mati dan tidak ada yang dicatat.

`.env.podman` **opsional**. Tanpa berkas itu email ditulis sebagai berkas ke
`data/outbox-mail/` dan tidak ada yang keluar dari mesin — cukup untuk
mendemokan seluruh alur. Untuk mengirim email sungguhan, isi `.env.podman`
lewat jalur pribadi: di dalamnya ada App Password, dan repositori bukan tempat
untuk itu. Bila portal dibuka dari perangkat lain lewat alamat IP, sesuaikan
`APP_BASE_URL` — setiap tautan persetujuan di email dibangun dari nilai itu.

**Container ini sengaja berjalan dalam mode development**, dan itu bukan
kemalasan. Aplikasi ini memuat sembilan penjagaan produksi, dan konfigurasi demo
melanggar hampir semuanya: tanpa `LDAP_URL`, `authenticateAD` **melempar error**
alih-alih menurunkan mutu — tidak ada yang bisa masuk sama sekali; `AD_DRIVER=mock`,
`MOCK_AD_LOGIN`, `EMAIL_DRIVER=file`, dan `EMAIL_REDIRECT_TO` masing-masing
ditolak; dan cookie sesi menyalakan `secure`, sehingga browser tidak akan
mengirimnya lewat `http://localhost` dan login tidak pernah nempel tanpa TLS.
`next start` akan menghasilkan container yang menyala bersih lalu menolak setiap
login — lebih buruk daripada tidak ada container, karena ia tampak berfungsi.

Image produksi adalah artefak berbeda dengan masukan berbeda: domain controller
sungguhan, mailbox sungguhan, kunci enkripsi yang dibangkitkan, dan proxy yang
menerminasi TLS. Bukan berkas ini dengan satu flag dibalik.

`.containerignore` adalah keamanan, bukan kerapian, dan merupakan berkas yang
mencegah rahasia masuk ke image. Apa pun yang tersalin ke sebuah
layer menetap di sana dan terbaca siapa pun yang bisa menarik image — sekalipun
layer berikutnya menghapusnya. `.env*` memuat App Password yang hidup, dan
`data/` memuat hash id sesi, payload outbox tersegel, serta tabel token
persetujuan. Keduanya masuk saat runtime: rahasia lewat `env_file`, state lewat
bind mount.

Satu volume menutupi semuanya, karena keempat berkas yang ditulis aplikasi —
`hc-store.json`, `hc-sessions.json`, `mock-ad.json`, dan `outbox-mail/` — berada
di bawah `data/`. Mengikatnya ke host juga yang membuat container melihat akun
yang sudah di-seed `npm run mock-ad:roles`, bukan direktori kosong yang tidak
bisa dimasuki siapa pun.

**Berkas data yang "hilang" tidak pernah dianggap kosong.** Pada 22 September 2026
store sempat tak terlihat sesaat dari dalam container (folder `data/` dibagi dari
Windows), sebuah penjadwal membacanya di saat itu, menganggapnya instalasi baru,
dan menulis data seed di atas 28 pengajuan. Kini berkas yang pernah terbaca lalu
lenyap dibaca ulang beberapa kali, dan bila tetap tidak ada, operasinya **gagal
tanpa menulis apa pun**; data awal hanya dibuat pada run pertama, dan tidak pernah
di atas berkas yang ada (`src/lib/db/stateFile.ts`). Tetap simpan cadangan
`data/` sebelum percobaan besar.

Container dan `npm run dev` **tidak boleh jalan bersamaan**. Keduanya menulis
`data/` yang sama, sedangkan kunci di `store.ts` hanyalah antrean per-proses dan
tidak bisa menengahi dua proses — dan dua penjadwal outbox yang menyapu antrean
yang sama berarti satu email persetujuan bisa terkirim dua kali.

**Portal hanya menerima koneksi dari komputernya sendiri.** `compose.yaml`
mempublikasikan port ke `127.0.0.1:3000`, bukan ke `0.0.0.0`. Alasannya bukan
kerapian: aplikasi ini berjalan dalam mode development, tanpa TLS, dengan
direktori simulasi dan akun demo yang kata sandinya tertulis di README ini —
begitu port-nya terbuka ke jaringan, siapa pun di jaringan yang sama bisa masuk
sebagai HC. Untuk mendemokan dari ponsel atau laptop lain, ubah ke
`"0.0.0.0:3000:3000"` **dan** sesuaikan `APP_BASE_URL` ke alamat itu, karena
setiap tautan persetujuan di email dibangun dari nilai tersebut; kembalikan
setelah selesai.

**Kunci enkripsi outbox sebaiknya diisi, meski di demo.** Tanpa
`OUTBOX_ENCRYPTION_KEY`, di luar production kunci diturunkan dari string tetap
yang ada di dalam kode — jadi payload tersegel di `data/` bisa dibuka siapa pun
yang punya repositori ini. Isi dengan `openssl rand -base64 32` (atau
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
Mengganti kunci membuat payload yang **masih menunggu kirim** tidak bisa dibuka,
jadi lakukan saat antrean outbox kosong; payload dihapus begitu pesannya
terkirim, sehingga riwayat lama tidak terpengaruh.

**Satu proses pun punya beberapa salinan modul.** Next mengompilasi `store.ts`
terpisah untuk route handler, halaman, dan `instrumentation.ts` (penjadwal
outbox & worker), sehingga kunci yang disimpan di variabel modul sebenarnya
tiga kunci. Pada 22 September 2026 uji ujung-ke-ujung menangkap akibatnya:
persetujuan manager dijawab 200, lalu penjadwal outbox — yang sudah membaca
store beberapa milidetik sebelumnya — menyimpan "email terkirim" di atasnya,
dan persetujuannya hilang. Kunci ketiga store (data, sesi, mock AD) kini
disimpan di `globalThis` (`src/lib/db/processShared.ts`) sehingga semua salinan
mengantre di kunci yang sama; `processShared.test.ts` mereproduksi kasusnya
dengan dua salinan modul.

## Identitas dan wewenang

Keduanya sengaja dipisah:

- **Ada di Active Directory** berarti Anda karyawan. Itu saja tidak memberi
  wewenang apa pun di portal ini.
- **Punya peran portal** berarti HC/IT memasukkan Anda ke group AD yang
  dipetakan ke salah satu peran. Yang tidak punya peran **tidak bisa masuk sama
  sekali** — login ditolak sebelum sesi dibuat, dan sesi lama yang hanya
  membawa peran yang sudah dihapus langsung berhenti berlaku.
- **Approver bukan peran portal.** Manager dan tim CISO memutuskan dari email.
  `AD_GROUP_MANAGER` dan `AD_GROUP_CISO`, bila masih diisi, diabaikan.

Pemetaan group diatur lewat `AD_GROUP_*` (lihat `.env.example`). Satu orang
boleh memegang beberapa peran sekaligus.

Pencocokannya membandingkan **komponen DN secara utuh**, bukan substring. Boleh
diisi DN lengkap, bagian depannya seperti `CN=HC Admins`, atau nama umumnya saja
— ketiganya bekerja. Yang tidak akan cocok adalah separuh nama: `CN=HC Admins`
sengaja **tidak** cocok dengan `CN=Former HC Admins` maupun
`CN=HC Admins Read-Only`. Sebelumnya pencocokan substring membuat keanggotaan
group arsip atau read-only diam-diam memberikan wewenang group aslinya —
termasuk `SYSTEM_ADMIN`.

| Peran | Wewenang |
| --- | --- |
| `HC_REQUESTER` | Direktori, aktivitas, **buat, revisi & batalkan pengajuan** (termasuk perubahan profil) |
| `SYSTEM_ADMIN` | Baca direktori, aktivitas, pengajuan; konfigurasi portal |
| `OPS_OPERATOR` | Baca direktori, aktivitas, pengajuan; **menjalankan worker** |
| `AUDITOR` | Baca dan ekspor direktori, baca aktivitas dan pengajuan |

Perhatikan yang **tidak** ada di tabel itu: tidak ada peran yang bisa
menyetujui apa pun dari portal, `SYSTEM_ADMIN` sekalipun. Kedua approval hanya
bisa diberikan dari email, oleh orang yang dituju.

Matriks lengkapnya ada di satu tempat — `src/lib/auth/roles.ts` — dan setiap
handler meminta *permission*, bukan peran. Menambah peran tidak pernah berarti
menyunting route.

## Sesi

Cookie hanya membawa id acak 32 byte; catatan sesinya tersimpan di server dan
yang disimpan hanyalah hash id tersebut. Tiga hal mengakhiri sesi:

- **absolute expiry** — batas keras yang tidak diperpanjang aktivitas apa pun;
- **idle expiry** — jendela menganggur yang maju selama masih dipakai, tidak
  pernah melewati batas keras di atas;
- **pencabutan** — berlaku seketika: logout, atau perubahan peran di AD yang
  terdeteksi saat login berikutnya.

Ini menggantikan JWT sebelumnya. Bedanya yang penting adalah pencabutan: token
bertanda tangan tetap sah sampai kedaluwarsa apa pun yang terjadi pada akunnya,
sehingga logout dulu tidak benar-benar mengakhiri sesi — hanya menyembunyikannya.

## Lapisan pemeriksaan

`src/proxy.ts` hanya memeriksa **ada atau tidaknya** cookie sesi, lalu
mengarahkan yang jelas belum masuk ke `/login`. Itu bukan kontrol aksesnya:
proxy tidak tahu sesi di balik cookie masih sah atau tidak, dan tidak tahu izin
apa yang dibutuhkan sebuah route.

Kontrol yang sebenarnya ada di dua tempat, dan keduanya membaca catatan sesi:

- `src/lib/auth/guard.ts` — `requirePermission()` untuk setiap route handler;
- `requirePageSession()` + `hasPermission()` untuk setiap halaman.

## Halaman

| Route | Fungsi | Izin |
| --- | --- | --- |
| `/` | Direktori karyawan — keadaan akun, bukan status pengajuan | `directory.read` |
| `/pengajuan` | Daftar pengajuan, tersaring sesuai lingkup | `request.read` |
| `/pengajuan/baru` | Tiga form: Onboarding, Movement, Termination | `request.create` |
| `/pengajuan/[id]` | Detail, siapa yang diminta dan siapa yang memutuskan, jejak audit | `request.read` |
| `/pengajuan/[id]/revisi` | Revisi oleh pemohon — dikirim ulang otomatis ke manager | `request.create` |
| `/persetujuan/[token]` | Halaman konfirmasi keputusan dari tautan email — **tanpa sesi**, satu-satunya tempat approver memutuskan | token |
| `/users/edit` | Ajukan perubahan profil karyawan (pengajuan `PROFILE_UPDATE`) | `employee.update` + `request.create` |
| `/aktivitas` | Jejak aktivitas | `activity.read` |
| `/profile` | Akun sendiri | — |
| `/login` | Masuk | — |

## API

| Method | Route | Izin |
| --- | --- | --- |
| `POST` | `/api/auth/login` | — |
| `POST` | `/api/auth/logout` | — |
| `GET` | `/api/auth/me` | sesi saja |
| `GET` | `/api/users` | `directory.read` |
| `GET` | `/api/users/:id` | `directory.read` |
| `GET` | `/api/activity` | `activity.read` |
| `POST` | `/api/directory/export` | `directory.export` |
| `GET` | `/api/lifecycle-requests` | `request.read` |
| `POST` | `/api/lifecycle-requests` | `request.create` |
| `GET` | `/api/lifecycle-requests/:id` | `request.read` |
| `POST` | `/api/lifecycle-requests/:id/submit` | `request.create` |
| `POST` | `/api/lifecycle-requests/:id/revise` — revisi + kirim ulang, wajib `version` | `request.create` |
| `POST` | `/api/lifecycle-requests/:id/cancel` | `request.cancel` |
| `POST` | `/api/lifecycle-requests/:id/retry` | `execution.run` |
| `POST` | `/api/admin/migrate-legacy` | `system.migrate` |
| `POST` | `/api/worker/run` | `execution.run` |
| `POST` | `/api/admin/seed-mock-ad` | `system.migrate` |
| `POST` | `/api/outbox/dispatch` | `execution.run` |
| `POST` | `/api/approval-actions` | token sekali pakai |

## Pengajuan lifecycle

Satu entitas menangani keempatnya — Onboarding, Movement, Termination, dan
Perubahan Profil (`PROFILE_UPDATE`).
Alurnya: `DRAFT → PENDING_MANAGER → PENDING_CISO → APPROVED → QUEUED →
EXECUTING → COMPLETED`, dengan `REJECTED`, `CANCELLED`, dan `EXPIRED` sebagai
ujung lain. Seluruh transisi yang sah ada di satu tabel di
`src/lib/lifecycle/stateMachine.ts`.

Beberapa aturan yang ditegakkan kode, bukan sekadar konvensi:

- **Pengajuan mencatat usulan, bukan perubahan.** Direktori tetap menampilkan
  keadaan akun sebenarnya sampai eksekusi terverifikasi, sehingga Movement yang
  masih menunggu tidak pernah membuat seseorang tampak sudah pindah.
- **`APPROVED` bukan `COMPLETED`.** Approval kedua mengesahkan perubahan, tidak
  melakukannya. Request masuk antrean eksekusi dan menunggu worker.
- **Payload dikunci saat submit** dan disidik jari dengan SHA-256. Setiap
  keputusan dicatat terhadap `version` dan `payloadHash` tertentu.
- **Revisi bukan penyuntingan.** Isi baru menjadi versi baru, approval lama
  dibuang, dan kedua approver ditanya ulang — karena mereka menyetujui teks
  yang sudah tidak ada. Revisi dan pengiriman ulang terjadi dalam **satu
  transaksi**: email persetujuan versi baru langsung masuk outbox untuk
  manager, dan bila pengiriman ulang ditolak (misalnya bentrok pemisahan
  tugas) tidak ada yang berubah sama sekali. Revisi wajib membawa `version`
  yang sedang dilihat, dan tidak boleh mengganti karyawan yang diajukan.
- **Edit profil juga pengajuan.** Menyimpan di `/users/edit` membuat
  `PROFILE_UPDATE` yang dirutekan ke manager **saat ini** lalu CISO. Tabel
  "sebelum → sesudah" dihitung server dari catatan, bukan dari browser; catatan
  internal HC tidak pernah masuk antrean email. Worker hanya menulis nama,
  departemen, dan jabatan ke AD, lalu memverifikasi status aktif, OU, dan group
  tidak ikut berubah. `PUT /api/users/:id` dihapus — dulu ia bisa memindahkan
  departemen tanpa persetujuan siapa pun.
- **Onboarding dibuat begitu disetujui.** Form tidak meminta tanggal mulai
  bekerja; sistem mengisinya otomatis. Karyawan kontrak hanya diminta tanggal
  terakhir bekerja. Setelah CISO menyetujui, akun langsung dibuat oleh worker
  otomatis — bahkan onboarding lama yang sempat dijadwalkan ikut diproses.
  Pengajuan Movement baru berjalan setelah disetujui, sedangkan Termination
  berjalan sehari setelah tanggal terakhir bekerja. Jadwal efektif pada
  pengajuan lama tetap dihormati. Karyawan yang sedang diproses langsung
  tampil di panel "Karyawan baru dalam proses" di dashboard, lalu pindah ke
  tabel direktori setelah akunnya diverifikasi.
- **Tanggal harus masuk akal.** Tahun wajib 4 digit, dan tiap tanggal punya
  rentang (misalnya waktu efektif maksimal 1 tahun ke depan) — dulu tahun 132144
  diterima dan pengajuannya menunggu selamanya.
- **Routing ditentukan server.** HC tidak pernah mengetik alamat approver.
  Onboarding dan Movement dirutekan ke manager divisi **tujuan**; Termination ke
  manager **saat ini**; CISO ke **tim CISO** (group AD `CISO_APPROVER_GROUP`,
  atau daftar `CISO_APPROVER_EMAILS`).
- **Manager yang dipilih harus ada di direktori.** Form Onboarding/Movement
  tidak lagi punya isian email manager bebas — dulu pemohon bisa mengarahkan
  persetujuan tahap pertama ke mailbox mana pun, termasuk miliknya sendiri.
  Server menolak alamat yang bukan karyawan **aktif** dan mengganti nama yang
  diketik dengan nama dari direktori. Pengajuan yang sudah berjalan tidak
  terpengaruh; approver-nya dibekukan saat submit.
- **Tim CISO: keputusan pertama yang berlaku.** Setiap anggota mendapat email
  dan tautan pribadinya sendiri — bukan satu tautan ke distribution list, yang
  tidak bisa mencatat siapa yang menyetujui. Anggota pertama yang menyetujui
  atau menolak menentukan tahap itu; tautan anggota lain mati dalam transaksi
  yang sama, dan bila dibuka menampilkan "Sudah disetujui oleh X pada …". Email
  yang sudah masuk inbox tidak bisa ditarik, tetapi tautannya tidak bisa
  dipakai lagi. Daftar anggota dibekukan saat submit. Kepala CISO tidak
  dimasukkan ke daftar dan tidak menerima tautan apa pun.
- **Pemisahan tugas diperiksa saat submit**, bukan saat keputusan: pemohon tidak
  boleh menjadi approver, dan Manager tidak boleh sama dengan CISO. Anggota tim
  CISO yang merupakan pemohon atau manager pada pengajuan itu dikeluarkan dari
  daftar; pengajuan baru ditolak bila tidak ada anggota yang tersisa.
- **Satu pengajuan aktif per karyawan.** Dua payload disetujui yang berebut satu
  akun adalah cara akun berakhir dalam keadaan yang tidak diminta keduanya.
- **Klik ganda bukan dua keputusan.** Keputusan identik yang diulang
  mengembalikan hasil yang sama tanpa event audit kedua.
- **Jejak audit append-only**, ditulis dalam transaksi yang sama dengan
  perubahannya. Terpisah dari `activity` yang dibatasi 500 entri — log yang
  memangkas dirinya sendiri layak untuk dasbor, tidak layak sebagai bukti.

### Status akun vs status pengajuan

Direktori hanya menyatakan keadaan **akun**: Aktif atau Nonaktif. Sebelumnya ia
membawa status seperti `PENDING_TRANSFER_SETUP`, artinya daftar karyawan
melaporkan keadaan sebuah *pengajuan* — sehingga orang yang perpindahannya masih
menunggu approval sudah tampak setengah pindah, dan pengajuan yang mati
meninggalkan orangnya terdampar di status yang tidak lagi menempel pada apa pun.

Usulan perubahan kini hidup di pengajuan, dan direktori tetap mengatakan yang
sebenarnya tentang akun sampai eksekusi terverifikasi. Kolom "Pengajuan
berjalan" menampilkan fakta terpisah itu, dengan tautan ke pengajuannya.

### Yang dihapus dari UI

Beberapa kendali dibuang karena menampilkan sesuatu yang tidak benar:

- **Simulator peran** di atas direktori. Ia menyaring baris di sisi browser,
  jadi tampak seperti kontrol akses padahal bukan — semua baris sudah ada di
  browser, dan backend tidak pernah diberi tahu peran mana yang "dipilih".
- **Tabel audit** di laporan cetak karyawan. Ketiga barisnya hard-coded —
  referensi `SEC-2041` yang sama dicetak untuk setiap karyawan, termasuk yang
  akunnya tidak pernah disetujui siapa pun. Pada dokumen berkepala "Dokumen
  Resmi", itu bukan placeholder melainkan rekaman palsu.
- **Generator password sementara** dan **link aktivasi**. Keduanya mengarang
  nilai di browser dan mengumumkannya berhasil dibuat; tidak ada yang
  menerimanya dan tidak ada akun yang memakainya.
- **Timeline audit** di panel detail, yang merender empat langkah persetujuan
  yang sama untuk semua orang.
- **Bulk action bar**, yang tombolnya menampilkan pesan sukses dan tidak
  mengubah apa pun.

## Eksekusi ke direktori

Worker menjalankan perubahan yang sudah disetujui penuh. Urutan langkahnya bukan
detail implementasi — tiap urutan dipilih supaya berhenti **di titik mana pun**
meninggalkan akun dalam keadaan aman, bukan permisif:

| Jenis | Urutan | Kalau berhenti di tengah |
| --- | --- | --- |
| Onboarding | buat (nonaktif) → atribut → group → verifikasi → **aktifkan** | Akun ada tapi tidak bisa dipakai |
| Termination | **nonaktifkan** → cabut group → pindah karantina → verifikasi | Akses sudah hilang di langkah pertama |
| Movement | atribut → cabut lama → beri baru → pindah OU → verifikasi | Tidak pernah memegang dua set akses sekaligus |

Aturan yang ditegakkan kode:

- **`COMPLETED` menuntut pembacaan ulang.** Operasi yang selesai tanpa melempar
  error bukan bukti direktori sekarang menyatakan apa yang diminta. Postcondition
  dibaca balik dari direktori, dan hanya itu yang boleh mengubah status akun di
  direktori aplikasi.
- **Tiap langkah dicheckpoint**, dan `operationId` diturunkan dari
  `requestId:version`. Percobaan ulang melanjutkan, bukan mengulang — mengulang
  `create-account` berarti akun kedua.
- **Drift dihentikan, bukan ditimpa.** Bila akun berubah sejak disetujui,
  eksekusi berhenti dengan kode `DRIFT` dan tidak menulis apa pun: persetujuan
  diberikan untuk keadaan yang sudah tidak berlaku, jadi mengulang justru salah.
- **Timeout setelah write tidak pernah diulang otomatis.** Perubahannya mungkin
  sudah mendarat; mengirimnya lagi tanpa membaca dulu adalah cara satu perubahan
  yang disetujui menjadi dua yang diterapkan.
- Hanya group yang diterbitkan katalog yang dicabut. Keanggotaan yang ditambahkan
  manual bukan milik aplikasi ini untuk dihapus.

Demo memakai `AD_DRIVER=mock` — direktori simulasi di berkas terpisah, dengan
injeksi kegagalan lewat `AD_MOCK_FAULT` untuk melatih jalur yang justru paling
perlu dibuktikan. **Production menolak driver mock.**

### Active Directory sungguhan (`AD_DRIVER=ldap`)

Driver LDAPS (`src/lib/ad/ldapAd.ts`) mengimplementasikan `AdDriver` apa adanya,
jadi tidak ada satu pun perubahan pada pengajuan, persetujuan, email, atau
urutan langkah worker. Yang ditambahkan hanya penerjemahan: objectGUID biner ke
string kanonik, bit `ACCOUNTDISABLE` ke `enabled`, DN manager ke
sAMAccountName, `distinguishedName` ke OU, dan `memberOf` disaring menjadi hanya
group yang diterbitkan katalog akses.

Login pengguna dan worker memakai host LDAPS/CA yang sama: `LDAP_URL` (atau
`AD_LDAP_URL`), `LDAP_BASE_DN`, dan `LDAP_CA_CERT_PATH`. Login mengikat sebagai
pengguna; worker mengikat terpisah sebagai `AD_BIND_DN`. Akun tanpa salah satu
group `AD_GROUP_HC`, `AD_GROUP_ADMIN`, `AD_GROUP_OPS`, atau `AD_GROUP_AUDITOR`
ditolak masuk. `.env.onprem.example` adalah template tanpa rahasia untuk
deployment Windows Server; salin menjadi `.env.production` yang ACL-nya hanya
mengizinkan akun service membaca, lalu isi nilai asli dari tim AD/infrastruktur.

Keamanannya bukan opsi yang bisa dimatikan:

- **Hanya `ldaps://` port 636**, rantai sertifikat diverifikasi terhadap CA di
  `LDAP_CA_CERT_PATH`, verifikasi hostname menyala. Tidak ada
  `rejectUnauthorized: false` dan tidak ada fallback plaintext — kata sandi akun
  layanan melewati koneksi ini pada setiap operasi.
- **Akun layanan terpisah** (`AD_BIND_DN`) dari bind login pengguna. Yang satu
  boleh menonaktifkan akun, yang lain hanya membuktikan identitas.
- **`AD_MANAGED_OUS` membatasi semua penulisan.** Objek atau OU tujuan di luar
  daftar itu ditolak tanpa menulis apa pun. Keanggotaan group dibatasi lebih
  ketat lagi: hanya DN group yang diterbitkan katalog akses, sehingga driver ini
  tidak bisa menambahkan siapa pun ke group yang tidak pernah dikenalkan
  kepadanya.
- **OU dan group katalog akses bukan nilai production bawaan.** Isi
  `AD_OU_STANDARD`, `AD_OU_ENGINEERING`, `AD_OU_FINANCE`, `AD_OU_SECURITY`,
  `AD_ACCESS_GROUP_BASE`, `AD_ACCESS_GROUP_ENGINEERING`,
  `AD_ACCESS_GROUP_FINANCE`, dan `AD_ACCESS_GROUP_SECURITY` dengan DN yang
  disetujui tim AD. Seluruh OU tujuan, termasuk `AD_QUARANTINE_OU`, harus ada
  di `AD_MANAGED_OUS`.
- **`AD_LDAP_WRITE_ENABLED` default mati.** Selama mati, setiap operasi tulis
  ditolak dengan pesan jelas — bahkan sebelum koneksi dibuka — sementara
  pembacaan tetap jalan. Itu keadaan untuk memverifikasi koneksi, hak, dan OU
  sebelum ada yang berubah di direktori:

  ```bash
  npm run ad:service-check -- <sAMAccountName> [<group DN>]
  ```

  Skrip itu hanya membaca: bind akun layanan, baca satu akun, baca satu group.
  Aman diarahkan ke domain controller production sebelum yang lain.
- **Filter selalu di-escape** (RFC 4515), termasuk pencarian objectGUID dalam
  bentuk biner byte demi byte. Nama akun `*` tidak pernah menjadi "semua objek".
- **Password tidak pernah disentuh.** Driver ini tidak menulis `unicodePwd`,
  tidak mengarang kata sandi, dan tidak memakai `PASSWD_NOTREQD`. Konsekuensinya
  jujur: akun baru dibuat nonaktif tanpa password, dan bila kebijakan domain
  mewajibkan password sebelum akun boleh aktif, langkah `enable-account` ditolak
  direktori — pengajuan berakhir `FAILED` dengan alasan aslinya, akunnya sudah
  ada dalam keadaan nonaktif dan tidak bisa dipakai. Yang memegang penerbitan
  password mengisinya, lalu langkah itu diulang dari titik yang sama.

#### Menjalankan di Windows Server internal

Production dijalankan langsung dengan Node.js 22 sebagai **satu instance**,
bukan container. Salin `.env.onprem.example` menjadi `.env.production`,
lengkapi hanya dengan nilai yang sudah dikonfirmasi tim AD/infrastruktur, dan
batasi ACL berkas itu ke akun service serta administrator. Jangan masukkan
rahasia ke Git. Untuk awal, biarkan `AD_LDAP_WRITE_ENABLED=false`.

```powershell
npm ci
npm run ad:check -- <akun-pengguna>
npm run ad:service-check -- <akun-di-OU-kelola> <DN-group-CISO>
npm run build
npm run start
```

Setelah pemeriksaan read-only lolos, uji lifecycle di OU pilot dengan email
approval dialihkan ke penguji; baru setelah bukti uji diterima, aktifkan
`AD_LDAP_WRITE_ENABLED=true` dan gunakan OU production yang didelegasikan.
PC pilot memakai `.env.onprem.example`: `AD_LDAP_WRITE_ENABLED=false` dan
`AD_MANAGED_OUS` kosong pada tahap read-only. Isi akun layanan dan passwordnya
hanya di `.env.local` yang diabaikan Git. `ad:check` meminta password tanpa
menampilkannya atau menaruhnya di argumen proses. Untuk tahap tulis pilot,
masukkan hanya OU uji dan OU karantina uji ke `AD_MANAGED_OUS`, lalu arahkan
semua email ke alamat penguji lewat `EMAIL_REDIRECT_TO`.

Kedua perintah start mengikat Next ke `127.0.0.1`; di Windows Server IIS ARR
menjadi satu-satunya pintu HTTPS. Di PC kantor Podman Compose juga menerbitkan
port hanya ke loopback.

Jalankan `npm run start` sebagai Windows Service dengan akun lokal non-admin,
folder `data/` dan folder karyawan ber-ACL terbatas serta backup harian. IIS
URL Rewrite/ARR menjadi reverse proxy HTTPS ke `127.0.0.1:3000`; firewall hanya
membuka HTTPS bagi pengguna dan koneksi keluar server ke LDAPS 636 serta relay
email. Jangan jalankan lebih dari satu instance karena state aplikasi masih
berkas JSON lokal.

#### Urutan pilot dan pemindahan

Ikuti gerbang bertahap; jangan membuka penulisan AD sebelum pilot disetujui:

1. **Demo awal:** di PC kantor, jalankan `podman compose up` dengan konfigurasi
   simulasi. Pastikan portal dan alur approval demo jalan.
2. **Uji baca:** salin nilai dari `.env.onprem.example` ke `.env.local`, isi DC,
   CA, akun layanan, serta group peran yang telah disediakan tim AD. Biarkan
   `AD_LDAP_WRITE_ENABLED=false` dan `AD_MANAGED_OUS` kosong. Jalankan
   `npm run ad:check -- <akun-pengguna>` dan
   `npm run ad:service-check -- <akun-di-direktori> <DN-group-CISO>`. Pastikan
   login dan peran benar serta akun layanan dapat membaca objek dan group.
3. **Pilot tulis:** aktifkan `AD_LDAP_WRITE_ENABLED=true`, tetapi isi
   `AD_MANAGED_OUS` hanya dengan OU uji dan OU karantina uji. Pilih `smtp` atau
   `gmail`, arahkan `EMAIL_REDIRECT_TO` ke penguji, lalu uji Onboarding,
   Movement, Termination, dan Profile Update. Pastikan semua hasil dibaca
   kembali dan diverifikasi di AD uji.
4. **Production:** pindahkan ke satu Windows Server internal memakai
   `.env.onprem.example`, OU production yang sudah didelegasikan, group final,
   relay email production, backup `data/`, serta IIS HTTPS reverse proxy.
   Hapus `EMAIL_REDIRECT_TO` hanya setelah daftar penerima dicek dan akses
   approver dari luar kantor (VPN/jalur yang disetujui) dipastikan.

Sebelum tahap 2, tim AD/infrastruktur harus menetapkan nama DC dan CA LDAPS,
akun service serta delegasinya, OU uji/Karyawan/Karantina, group role dan CISO,
server/host HTTPS, relay email, dan proses password akun baru. Portal sengaja
tidak membuat tebakan untuk nilai-nilai tersebut.

#### Mencoba ke Active Directory sungguhan

Driver ini sudah dijalankan terhadap **Samba AD DC** — implementasi Active
Directory yang sungguhan, lengkap dengan `sAMAccountName`, `objectGUID`,
`userAccountControl`, dan LDAPS — di sebuah container sekali pakai. Resepnya
ditulis di sini karena satu putaran terhadap direktori sungguhan menemukan hal
yang tidak bisa ditemukan tes unit mana pun (lihat catatan `<GUID=...>` di
[ldapFilter.ts](src/lib/ad/ldapFilter.ts)).

```bash
podman network create hc-ad-demo
podman run -d --name samba-ad --hostname dc1 --privileged \
  --network hc-ad-demo --network-alias dc1.corp.example.com \
  -e REALM=CORP.EXAMPLE.COM -e DOMAIN=CORP \
  -e ADMIN_PASS='<kata-sandi-administrator>' -e DNS_FORWARDER=8.8.8.8 \
  diegogslomp/samba-ad-dc:latest
```

Satu hal yang perlu diperbaiki setelah provisioning: skrip image itu salah
membaca nama interface (`eth0@ifNN`), sehingga Samba hanya mendengar di
loopback. Perbaiki lalu mulai ulang:

```bash
podman exec samba-ad sed -i 's/interfaces = lo eth0@if[0-9]*/interfaces = lo eth0/' \
  /usr/local/samba/etc/smb.conf
podman restart samba-ad
```

Lalu buat OU dan group yang sama dengan katalog akses (`OU=Karyawan`,
`OU=Engineering,OU=Karyawan`, `OU=Karantina`, `OU=Groups` berisi `HC-Base` dan
kawan-kawan), satu akun manager, dan akun layanan `svc-hc-portal` — semuanya
lewat `samba-tool`. Delegasikan haknya dengan `samba-tool dsacl set` pada OU
yang dikelola saja, jangan dengan memasukkannya ke Domain Admins: itu justru
yang sedang ditunjukkan oleh `AD_MANAGED_OUS`.

Sertifikat CA-nya diambil dari direktorinya sendiri:

```bash
podman cp samba-ad:/usr/local/samba/private/tls/ca.pem ./ca.pem
```

Nama host harus cocok dengan sertifikat (`dc1.corp.example.com`) — itulah guna
`--network-alias` di atas, dan alasan pemeriksaan dijalankan dari dalam
container di jaringan yang sama. Baca dulu, tulis belakangan:

```bash
npm run ad:service-check -- bagus.nugroho "CN=IT Security Approvers,OU=Groups,DC=corp,DC=example,DC=com"
AD_LIVE_TEST=true AD_LDAP_WRITE_ENABLED=true npx vitest run src/lib/ad/ldapLive.test.ts
```

[ldapLive.test.ts](src/lib/ad/ldapLive.test.ts) mati secara default dan tidak
ikut `npm test`. Ia membuat satu akun, memberi dan mencabut group,
memindahkannya ke karantina, lalu menonaktifkannya — dan tidak menghapusnya,
karena driver ini memang tidak punya operasi hapus.

Hasil putaran pertama: **11/11 lolos**, dan `enable-account` **berhasil** di
Samba dengan kebijakan bawaannya. Itu bukan jaminan untuk AD Windows: di domain
yang mewajibkan password sebelum akun boleh aktif, langkah itu akan ditolak —
jalur tersebut sudah ditangani dan diuji, tetapi yang menentukan adalah
kebijakan domain tujuan, bukan kode ini.

Kegagalan LDAP dipetakan ke klasifikasi yang sudah dipakai worker
(`src/lib/ad/ldapErrors.ts`): busy/unavailable → `TRANSIENT`,
insufficientAccessRights → `PERMISSION`, entryAlreadyExists → `CONFLICT`,
noSuchObject → `NOT_FOUND`. Koneksi yang mati **setelah** permintaan tulis
dikirim menjadi `TIMEOUT_AFTER_WRITE` — tidak pernah diulang otomatis — sedangkan
koneksi yang ditolak sejak awal tetap `TRANSIENT`, karena permintaannya belum
pernah keluar. Kode yang tidak dikenali menjadi `UNKNOWN` dan tidak diulang.

Satu koneksi dibuka, di-bind, dan ditutup per operasi. Client yang dikumpulkan
akan menghemat satu handshake per langkah, dan juga berarti socket yang mati
diam-diam di antara dua langkah menggagalkan langkah kedua karena alasan yang
tidak ada hubungannya dengan langkah itu.

### Menyiapkan direktori simulasi

Demo bermula dari daftar karyawan dengan direktori kosong — keadaan yang tidak
pernah dialami deployment sungguhan, di mana akunnya sudah ada lebih dulu.
Tanpa disiapkan, setiap Movement dan Termination gagal pada objek yang tidak
ditemukan, dan yang tampak seperti worker rusak sebenarnya fixture kosong.

Jalankan sekali sebagai administrator sistem:

```
POST /api/admin/seed-mock-ad
```

Ia membuat akun simulasi untuk tiap karyawan **dan menautkannya** lewat
`objectGUID` — tautan itulah yang dipakai eksekusi, jadi membuat akun tanpa
mencatatnya tidak menyelesaikan apa pun. Aman dipanggil berulang, dan ditolak
bila driver-nya bukan simulasi.

## Email persetujuan

Keputusan **hanya** lewat email — portal tidak lagi punya jalur keputusan sama
sekali (`POST /api/lifecycle-requests/:id/decision` dihapus). Saat pengajuan dikirim, kewajiban
mengirim email **ditulis dalam transaksi yang sama** dengan perubahan statusnya —
itulah seluruh alasan outbox ada. Mengirim di dalam transaksi membuat provider
yang lambat menahan kunci database; mengirim setelah commit membuat crash di
antaranya menghilangkan kewajibannya sama sekali, dan pengajuan menunggu pada
orang yang tidak pernah diberi tahu. Menulis satu baris hanya berbiaya jeda.

Aturan yang ditegakkan kode:

- **`accepted` dicatat, `delivered` tidak.** Graph menjawab `sendMail` dengan
  202 Accepted, Gmail dengan 200 plus id pesan — keduanya berarti diantrekan,
  bukan sampai. Tidak ada field `deliveredAt` di mana pun, supaya tidak ada yang
  mengisinya karena mengira jawaban provider berarti pesan tiba.
- **Duplikat mungkin terjadi dan tidak dipungkiri.** Timeout setelah provider
  menerima pesan tidak menyisakan cara untuk tahu, dan retry mengirimnya lagi.
  Yang membuatnya aman ada di hilir: tautannya sekali pakai dan keputusannya
  idempoten, jadi dua salinan email tetap menghasilkan satu keputusan.
- **Token mentah hanya ada di dua tempat**: payload outbox yang terenkripsi
  (AES-256-GCM, kunci terpisah dari sesi) dan email itu sendiri. Payload dihapus
  begitu pesan diterima provider — antrean bukan tempat kredensial menganggur.
- **Tautan terikat satu tahap dan satu versi.** Tautan manager tidak bisa
  menjawab pertanyaan CISO, dan tautan untuk versi 1 tidak bisa menyetujui
  versi 2. Revisi mencabut seluruh tautan yang masih hidup.
- **Setujui satu klik dari email — pilihan sadar, dengan risikonya.** Tombol
  **Setujui** membawa `?putusan=setuju`, dan halamannya mengirim keputusan itu
  sendiri begitu dimuat. Endpoint keputusan hanya menerima POST, jadi pemindai
  yang sekadar mengambil URL tidak menyetujui apa pun; tetapi apa pun yang
  membuka tautan **dan menjalankan JavaScript-nya** akan menyetujui — gateway
  keamanan email yang menguji tautan di sandbox, atau pesan yang diteruskan lalu
  dibuka orang lain. Karena tahap CISO dikirim ke seluruh tim, risiko itu
  berlipat sebanyak anggota tim, dan satu persetujuan semacam itu juga
  mematikan tautan anggota lain. Halaman konfirmasi sempat dipasang pada
  21 September 2026 lalu dilepas lagi atas permintaan pemilik produk demi
  keputusan satu klik. **Tolak** tetap meminta alasan. Keputusan dicatat atas
  nama **pemilik tautan** (untuk tim: anggota yang tautannya dipakai), yang
  membuktikan kepemilikan mailbox, bukan identitas pengklik — itu yang kelak
  ditutup oleh Actionable Message dengan identitas Entra.
- Retry mengikuti tangga 1, 5, 15, 30, 60 menit dengan jitter, menghormati
  `Retry-After`, lalu dead-letter. Event yang diulang selamanya adalah event yang
  tidak pernah dibaca siapa pun.

Empat driver, dipilih eksplisit lewat `EMAIL_DRIVER`:

| Nilai | Keterangan |
| --- | --- |
| `file` | Tiap pesan ditulis sebagai `.html` yang bisa dibuka di browser persis seperti yang dilihat penerima. **Ditolak di production.** |
| `smtp` | SMTP lewat nodemailer. Untuk Gmail, isinya App Password 16 karakter dan menuntut 2-Step Verification aktif — password akun biasa sudah tidak diterima. |
| `gmail` | Gmail API lewat OAuth refresh token, scope `gmail.send` saja — tidak bisa membaca inbox. Token diperoleh sekali dengan `npm run gmail:auth`. |
| `graph` | Microsoft Graph `sendMail`, client credentials. |

`smtp` sudah benar-benar mengirim email ke inbox nyata. `gmail` dan `graph`
**belum pernah diuji ke akun atau tenant nyata**. Ketiganya menolak jalan tanpa
konfigurasi lengkap, dan menyebutkan persis nilai mana yang belum diisi alih-alih
diam-diam mundur ke driver lain.

**`EMAIL_REDIRECT_TO` mengalihkan semua email ke satu alamat**, dengan tujuan
aslinya tetap terbaca di subjek dan badan pesan. Ini bukan kenyamanan: direktori
demo memuat alamat manager di domain nyata, dan tiap email persetujuan membawa
token sekali pakai yang halamannya tidak menuntut login — pesan yang mendarat di
inbox keliru menyerahkan keputusan yang bukan milik orang itu. Mengalihkan lebih
dipilih daripada merapikan alamat karena tetap benar saat data berubah:
merapikan hanya membereskan baris yang ada hari ini. **Ditolak di production.**

**Pengiriman berjalan sendiri.** `src/instrumentation.ts` menyalakan penjadwal
saat server start, dan tiap `OUTBOX_POLL_SECONDS` detik (default 30 di luar
production) ia menjalankan dispatcher. Tanpa ini submit hanya mencatat kewajiban
kirim, dan tangga retry di atas cuma hiasan — percobaan berikutnya dijadwalkan
tetapi tidak pernah dijemput. Satu putaran tidak pernah tumpang tindih dengan
yang sebelumnya, dan kesalahan konfigurasi menghentikan penjadwal alih-alih
mengulang kegagalan identik tiap setengah menit.

**Di production penjadwal mati kecuali diisi eksplisit.** Kunci di `store.ts`
hanya berlaku per-proses, jadi loop ini benar untuk *tepat satu* instance — dan
deployment tidak tahu ia punya berapa. Untuk banyak instance, pakai penjadwal di
luar aplikasi yang memanggil `POST /api/outbox/dispatch`. Tombol manual di panel
email tetap ada pada kedua kasus.

Token tautan memang berada di URL — itulah bentuk tautan email — sehingga
`Referrer-Policy: no-referrer` dipasang agar URL itu tidak ikut terkirim ke
sumber daya pihak ketiga mana pun.

## Pengerasan HTTP

**Content-Security-Policy dengan nonce.** Nonce dibuat baru setiap request di
`src/proxy.ts`, dipasang ke header CSP respons **dan** ke header request supaya
Next dapat menempelkannya ke script framework serta bundle halaman. Script boot
tema di `layout.tsx` bukan komponen `<Script>`, jadi nonce-nya dipasang manual —
tanpa itu, satu-satunya script yang harus jalan sebelum paint pertama justru
yang diblokir.

Kekuatannya ada di `script-src`: nonce plus `strict-dynamic`, sehingga hanya
script yang dijamin server ini yang berjalan. **`style-src` sengaja tetap
`'unsafe-inline'`** — nonce tidak berlaku untuk *atribut* `style`, dan Framer
Motion merendernya saat SSR. Memakainya di sana akan merusak UI tanpa menahan
apa pun, jadi lebih jujur membiarkannya dan menyebutkan alasannya daripada
memasang kebijakan yang tampak lebih ketat dari kenyataannya.

**Perlindungan CSRF.** Mutasi berbasis cookie harus datang dari asal yang sama.
Serangan yang dicegah: halaman di origin lain membuat browser mengirim POST ke
aplikasi ini, dan browser dengan senang hati menyertakan cookie sesi — server
melihat request terautentikasi sempurna yang tidak pernah diinginkan penggunanya.
Tidak ada yang salah pada sesinya, dan justru itu sebabnya autentikasi tidak bisa
menangkapnya; bentuk request-nya yang harus diperiksa.

Logikanya berupa fungsi murni di `src/lib/http/csrf.ts` supaya dapat diuji tanpa
server hidup. Satu pengecualian, dan ia layak: `/api/approval-actions`
diautentikasi token sekali pakai dan diposting server Outlook yang bukan browser
dan tidak mengirim `Origin`. Pencocokannya berhenti di batas segmen —
`/api/approval-actions-fake` **tidak** ikut terkecuali.

**Asal "diri sendiri" dibaca dari header `Host`**, bukan dari alamat yang dikira
Next.js. Next selalu menganggap dirinya `localhost` (atau `0.0.0.0` di bawah
`next dev -H 0.0.0.0` di container), apa pun alamat di browser — sehingga dulu setiap
form yang dikirim dari `127.0.0.1`, dari IP jaringan, atau dari container ditolak
"berasal dari asal yang tidak dikenal", dan di dalam container **semuanya** ditolak.
Membaca `Host` tetap aman: request palsu dari situs lain dikirim browser dengan
`Host` situs ini dan `Origin` situs penyerang, jadi tetap tidak cocok. Yang juga
diterima: `APP_BASE_URL`, dan `X-Forwarded-Proto` dari proxy HTTPS (hanya
mengganti skema untuk host yang sama). Lihat `selfOrigins` di `csrf.ts`.

**Pembatasan laju.** Endpoint persetujuan mendapat ember sendiri yang lebih
ketat (20 per 5 menit) karena ia satu-satunya mutasi yang dapat dicapai tanpa
sesi; mutasi API lain 120 per menit. Dihitung di memori proses — perlindungan
nyata untuk satu instance, dan **tidak cukup** untuk beberapa replika, karena
tiap replika memegang pencacahnya sendiri sehingga batas efektifnya berlipat.
Production memerlukan ini di ingress bersama.

## Yang belum ada

Portal ini sedang diarahkan menjadi portal pengajuan lifecycle karyawan sesuai
implementation plan. Yang **belum** dikerjakan, dan tidak boleh dianggap ada:

- **Driver AD sungguhan sudah jalan ke Samba AD DC, belum ke AD Windows
  perusahaan.** `AD_DRIVER=ldap` mengembalikan driver LDAPS sungguhan
  ([ldapAd.ts](src/lib/ad/ldapAd.ts)), dan seluruh siklusnya — buat, atribut,
  group, aktifkan, pindah OU, nonaktifkan — sudah dijalankan terhadap domain
  controller sungguhan (lihat "Mencoba ke Active Directory sungguhan"). Yang
  belum: domain perusahaan yang asli, dengan kebijakan password, struktur OU,
  dan hak akun layanan miliknya sendiri. Ketiganya hanya bisa dijawab di sana,
  dan urutannya tetap sama: `npm run ad:service-check` dulu dengan sakelar tulis
  masih mati.
- **Worker production.** Di luar production worker kini berjalan otomatis: dipicu
  tepat setelah persetujuan terakhir (lewat `after()` di `/api/approval-actions`)
  dan menyapu antrean tiap `WORKER_POLL_SECONDS` (default 30, `0` mematikan).
  Keduanya berbagi satu run sehingga tidak tumpang tindih. Di production mati
  kecuali diisi, karena kuncinya per-proses. Topologi production — worker
  terpisah di jaringan perusahaan yang mengambil job lewat API dengan mTLS —
  belum ada.
- **Pengiriman email sungguhan.** Driver Graph (`src/lib/email/graphDriver.ts`)
  dan validasi identitas Entra (`src/lib/auth/entraToken.ts`) sudah ditulis
  tetapi **belum pernah diuji ke tenant nyata** — belum ada registrasi Entra,
  consent, maupun mailbox pengirim. Keduanya menolak berjalan tanpa konfigurasi
  lengkap, bukan diam-diam jatuh ke driver file.
- **Actionable Message di Outlook.** Kartunya dirender (Adaptive Card 1.0 dengan
  `Action.Http`), tetapi belum pernah dibuka di Outlook. Halaman
  `/persetujuan/[token]` adalah fallback browser yang disepakati — dan sesuai
  plan, fallback **tidak boleh** dinyatakan memenuhi acceptance "semua aksi
  langsung di email".
- Selama Entra belum dikonfigurasi, yang mengautentikasi keputusan email hanyalah
  token: sekali pakai, terikat satu tahap dan satu versi. Itu membuktikan
  kepemilikan tautan yang dikirim ke satu mailbox — **bukan identitas
  pengkliknya**.
- PostgreSQL, antrean job, dan worker. Penyimpanan masih berkas JSON satu host,
  sehingga sesi dan pengajuan tidak dibagi antar instance.
- **Pembatasan laju lintas instance.** Yang ada dihitung per proses, jadi batas
  efektifnya berlipat sebanyak replika yang berjalan.

### Migrasi alur lama

Store sempat memuat 13 pengajuan era Jira dan 10 karyawan terdampar di status
milik alur yang kodenya sudah dihapus — tidak ada di aplikasi yang bisa
memindahkan mereka. `POST /api/admin/migrate-legacy` menyelesaikannya sekali
jalan, dan aman dipanggil dua kali.

Pengajuan lama **diarsipkan di tempat, tidak dikonversi**. Keputusan yang
tercatat "approved" di sistem lama disahkan oleh kepemilikan tautan email;
membawanya masuk sebagai approval terverifikasi berarti mencuci kontrol lemah
menjadi tampak kuat. Bila perubahannya masih diinginkan, HC mengajukannya ulang.

Rekonsiliasi status sengaja condong ke keadaan tertutup: onboarding yang tidak
pernah selesai berarti akun tidak pernah dibuat, jadi catatannya menjadi
Nonaktif. Menebak Aktif sama dengan mengarang akses.

## Perintah

```bash
npm run dev
npm run build
npm run start
npm run lint        # --max-warnings 0: satu warning pun menggagalkan
npm run typecheck
npm test            # unit + integrasi domain lifecycle
npm run ad:check    # uji konektivitas LDAP
npm run gmail:auth  # tukar consent Google jadi refresh token, sekali saja
npm run mock-ad:roles          # beri group peran di direktori simulasi
npm run mock-ad:roles -- --undo  # kembalikan tepat yang ditambahkannya
```

`NEXT_DIST_DIR` memindahkan keluaran build ke direktori lain. Berguna justru
karena gejalanya membingungkan bila diabaikan: `next build` dan `next dev`
berbagi `.next`, dan build yang diambil selagi dev server melayani dari sana
meninggalkan pohon campuran — route handler bersarang mulai menjawab dengan
halaman 404 HTML sementara route induknya masih bekerja, yang terbaca seperti
bug routing di aplikasi.

```bash
NEXT_DIST_DIR=.next-build npm run build   # dev server di .next tetap aman
```

Pemeriksaan di atas dijalankan `.github/workflows/ci.yml` — **pada push ke
`main` dan pada setiap pull request**, bukan pada setiap push. Push ke branch
biasa tidak memicunya; bukalah pull request bila ingin diperiksa sebelum
digabung. urutannya: `npm ci`, typecheck, lint, test, build Next, lalu build image
dengan Podman.
