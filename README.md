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
| `admin` | `admin12345` | Administrator sistem + Human Capital | Mengajukan |
| `dimas` | `dimas12345` | Manager | Manager sebagian besar karyawan seed |
| `sarah` | `sarah12345` | Manager | Manager divisi IT — Engineering |
| `bagus` | `bagus12345` | CISO / IT Security | Approver tahap kedua |
| `budi` | `budi12345` | Manager | Punya peran, tidak memanajeri siapa pun — sengaja, untuk menguji penolakan |
| `rina` | `rina12345` | *(tidak ada)* | Akun AD valid tanpa wewenang portal |

`dimas` dan `sarah` ada karena alasan yang spesifik: routing menyelesaikan
approver ke alamat manager yang benar-benar tercatat di direktori, jadi tanpa
akun yang memakai alamat itu demo bisa mengajukan tetapi tidak pernah bisa
menyetujui.

Akun demo ditolak di production: di sana `LDAP_URL` yang belum diisi adalah
kesalahan konfigurasi, bukan alasan untuk meloloskan siapa pun.

## Identitas dan wewenang

Keduanya sengaja dipisah:

- **Ada di Active Directory** berarti Anda karyawan. Itu saja tidak memberi
  wewenang apa pun di portal ini.
- **Punya peran portal** berarti HC/IT memasukkan Anda ke group AD yang
  dipetakan ke salah satu peran. Yang masuk tanpa group terpetakan tetap
  mendapat sesi dan halaman profilnya sendiri — tidak lebih.

Pemetaan group diatur lewat `AD_GROUP_*` (lihat `.env.example`). Satu orang
boleh memegang beberapa peran sekaligus.

| Peran | Wewenang |
| --- | --- |
| `HC_REQUESTER` | Direktori, ubah profil, aktivitas, **buat & batalkan pengajuan** |
| `MANAGER` | Baca direktori dan pengajuan, **approval tahap pertama** |
| `CISO_APPROVER` | Baca direktori, aktivitas, pengajuan, **approval tahap kedua** |
| `SYSTEM_ADMIN` | Baca direktori, aktivitas, pengajuan; konfigurasi portal |
| `OPS_OPERATOR` | Baca direktori, aktivitas, pengajuan; **menjalankan worker** |
| `AUDITOR` | Baca dan ekspor direktori, baca aktivitas dan pengajuan |

Perhatikan yang **tidak** ada di tabel itu: `SYSTEM_ADMIN` tidak bisa membuat
pengajuan maupun menyetujui, dan tidak ada satu peran pun yang memegang kedua
approval. Satu akun yang bisa memenuhi keduanya membuat tanda tangan kedua tak
ada artinya.

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
| `/pengajuan/[id]` | Detail, kedua approval, jejak audit, dan tombol keputusan | `request.read` |
| `/persetujuan/[token]` | Halaman keputusan dari tautan email — **tanpa sesi** | token |
| `/users/edit` | Ubah profil karyawan | `employee.update` |
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
| `PUT` | `/api/users/:id` | `employee.update` |
| `GET` | `/api/activity` | `activity.read` |
| `POST` | `/api/directory/export` | `directory.export` |
| `GET` | `/api/lifecycle-requests` | `request.read` |
| `POST` | `/api/lifecycle-requests` | `request.create` |
| `GET` | `/api/lifecycle-requests/:id` | `request.read` |
| `POST` | `/api/lifecycle-requests/:id/submit` | `request.create` |
| `POST` | `/api/lifecycle-requests/:id/decision` | `approval.manager` / `approval.ciso` |
| `POST` | `/api/lifecycle-requests/:id/revise` | `request.create` |
| `POST` | `/api/lifecycle-requests/:id/cancel` | `request.cancel` |
| `POST` | `/api/lifecycle-requests/:id/retry` | `execution.run` |
| `POST` | `/api/admin/migrate-legacy` | `system.migrate` |
| `POST` | `/api/worker/run` | `execution.run` |
| `POST` | `/api/admin/seed-mock-ad` | `system.migrate` |
| `POST` | `/api/outbox/dispatch` | `execution.run` |
| `POST` | `/api/approval-actions` | token sekali pakai |

## Pengajuan lifecycle

Satu entitas menangani ketiganya — Onboarding, Movement, dan Termination.
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
  yang sudah tidak ada.
- **Routing ditentukan server.** HC tidak pernah mengetik alamat approver.
  Onboarding dan Movement dirutekan ke manager divisi **tujuan**; Termination ke
  manager **saat ini**; CISO berasal dari `CISO_APPROVER_EMAIL`.
- **Pemisahan tugas diperiksa saat submit**, bukan saat keputusan: pemohon tidak
  boleh menjadi approver, dan Manager tidak boleh sama dengan CISO.
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

Keputusan tidak lagi hanya lewat sesi portal. Saat pengajuan dikirim, kewajiban
mengirim email **ditulis dalam transaksi yang sama** dengan perubahan statusnya —
itulah seluruh alasan outbox ada. Mengirim di dalam transaksi membuat provider
yang lambat menahan kunci database; mengirim setelah commit membuat crash di
antaranya menghilangkan kewajibannya sama sekali, dan pengajuan menunggu pada
orang yang tidak pernah diberi tahu. Menulis satu baris hanya berbiaya jeda.

Aturan yang ditegakkan kode:

- **`accepted` dicatat, `delivered` tidak.** Graph menjawab `sendMail` dengan
  202 Accepted — artinya diantrekan, bukan sampai. Tidak ada field `deliveredAt`
  di mana pun, supaya tidak ada yang mengisinya karena mengira 202 berarti tiba.
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
- **Membuka tautan tidak memutuskan apa pun.** Keputusan adalah POST terpisah,
  karena pemindai email dan pratinjau tautan mengikuti setiap URL dalam pesan —
  dan halaman yang menyetujui saat dimuat akan disetujui oleh filter spam.
- Retry mengikuti tangga 1, 5, 15, 30, 60 menit dengan jitter, menghormati
  `Retry-After`, lalu dead-letter. Event yang diulang selamanya adalah event yang
  tidak pernah dibaca siapa pun.

Demo memakai `EMAIL_DRIVER=file`: tiap pesan ditulis sebagai `.html` yang bisa
dibuka di browser persis seperti yang dilihat penerima. **Production menolaknya.**

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

**Pembatasan laju.** Endpoint persetujuan mendapat ember sendiri yang lebih
ketat (20 per 5 menit) karena ia satu-satunya mutasi yang dapat dicapai tanpa
sesi; mutasi API lain 120 per menit. Dihitung di memori proses — perlindungan
nyata untuk satu instance, dan **tidak cukup** untuk beberapa replika, karena
tiap replika memegang pencacahnya sendiri sehingga batas efektifnya berlipat.
Production memerlukan ini di ingress bersama.

## Yang belum ada

Portal ini sedang diarahkan menjadi portal pengajuan lifecycle karyawan sesuai
implementation plan. Yang **belum** dikerjakan, dan tidak boleh dianggap ada:

- **Driver AD sungguhan.** `AD_DRIVER=ldap` sengaja melempar error, bukan diam-diam
  jatuh ke mock. Login membaca AD; belum ada yang menulis ke AD nyata.
- **Worker terjadwal.** Eksekusi dipicu manual lewat `POST /api/worker/run`.
  Topologi production — worker terpisah di jaringan perusahaan yang mengambil job
  lewat API dengan mTLS — belum ada; yang sudah dilatih adalah bagian yang membawa
  risikonya, bukan transportnya.
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
- Revisi pengajuan: endpoint `/revise` ada dan teruji, belum ada layarnya.
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
npm run lint       # --max-warnings 0: satu warning pun menggagalkan
npm run typecheck
npm test           # unit + integrasi domain lifecycle
npm run ad:check   # uji konektivitas LDAP
```

Keempat pemeriksaan di atas dijalankan otomatis pada setiap push dan pull
request lewat `.github/workflows/ci.yml`. Sebelum ada berkas itu, "semuanya
lulus" adalah sesuatu yang harus diingat seseorang untuk diperiksa; sekarang ia
syarat untuk merge.
