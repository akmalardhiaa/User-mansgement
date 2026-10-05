# Menjalankan portal & menyambungkannya ke AD on-premise

Dua hal, dan urutannya penting: jalankan dulu tanpa AD — portal, pengajuan, dan
persetujuan lewat email sudah bisa dicoba — baru sambungkan ke Active Directory
sungguhan, yang dibutuhkan worker untuk benar-benar mengubah akun. Berkas ini
satu-satunya yang perlu dibuka untuk keduanya.

> README.md menjelaskan **kenapa** portal ini dibangun begini. Berkas ini
> menjelaskan **caranya menjalankan**. Kalau keduanya bertentangan, yang di
> sini lebih baru.

---

## Bagian 1 — Menjalankan di PC

Satu cara, tanpa container dan tanpa hak admin: **klik dua kali
`jalankan.bat`.** Seluruh portal — halaman, API, worker, dan pengirim email —
berjalan di satu proses Node di jendela itu. Biarkan jendelanya terbuka; tutup
dengan **Ctrl+C** untuk mematikan portal. Setelah PC di-restart, klik dua kali
lagi.

Portal terbuka di **http://localhost:3000**. Login: `admin` / `admin12345`.

Tanpa AD, pengajuan bisa dibuat dan disetujui, tetapi **worker tidak menjalankan
perubahan apa pun** — tidak ada lagi direktori simulasi sebagai gantinya. Itu
baru jalan setelah AD disambungkan (Bagian 2).

Node.js belum ada dan tidak boleh memasang apa pun? Unduh Node 22 versi **.zip**
dari nodejs.org, ekstrak jadi folder `node` di sebelah `jalankan.bat`. Skrip itu
memakainya tanpa perlu dipasang.

Jaringan kantor memblokir npm? Salin folder `node_modules` dari komputer lain —
lihat bagian B.

### B. Memindahkan ke komputer lain

**Klik dua kali `siapkan-pindah.bat`**, isi tujuannya (mis. `E:\portal-hc`).

Yang ikut: kode, `node_modules`, `data/`, dan berkas `.env`. Yang tidak: `.next`
(cache build, dibuat ulang sendiri), `.git`, dan cadangan `*.bak-*`. Hasilnya
sekitar 490 MB. Skrip itu menolak menyalin selama portal masih menyala, supaya
salinan `data/` tidak setengah jadi — tutup dulu jendela `jalankan.bat`.

Tiga hal yang mudah terlewat:

- **Jangan nyalakan di dua komputer sekaligus** pada data yang sama. Dua
  penjadwal outbox berarti satu email persetujuan terkirim dua kali.
- `.env.local` berisi kata sandi dan kunci outbox. Pindahkan lewat **jalur
  pribadi**, jangan lewat chat atau repositori.
- Tanpa berkas itu pun portal jalan: email ditulis sebagai berkas ke
  `data/outbox-mail/` dan seluruh alurnya tetap bisa didemokan.

---

## Bagian 2 — Menyambungkan ke AD on-premise

### Urutannya

```
1. Minta dari tim AD & infrastruktur  →  2. Isi .env  →  3. UJI BACA SAJA
                                                            ↓
                   5. Nyalakan sakelar tulis  ←  4. Periksa hasilnya
```

Jangan melompat ke langkah 5. Portal ini sengaja dibuat bisa berjalan dengan
akses **baca saja**, supaya koneksi, hak, dan struktur OU bisa dibuktikan dulu
sebelum ada satu pun objek direktori yang berubah.

### Langkah 1 — Yang harus diminta

| Yang diminta | Dipakai untuk |
|---|---|
| Alamat domain controller + port **636** | `LDAP_URL`, `AD_LDAP_URL` |
| Sertifikat CA penandatangan DC (PEM) | `LDAP_CA_CERT_PATH` |
| Akun layanan + kata sandinya | `AD_BIND_DN`, `AD_BIND_PASSWORD` |
| OU mana yang boleh ditulis portal | `AD_MANAGED_OUS` |
| OU karantina untuk akun nonaktif | `AD_QUARANTINE_OU` |
| OU default akun baru, dan group akses | `AD_OU_STANDARD`, `AD_ACCESS_GROUP_*` |
| **OU tiap divisi** — daftar Divisi → OU, atau satu OU induk berisi OU bernama sama dengan divisinya | `AD_DEPARTMENT_OUS`, `AD_DEPARTMENT_OU_PARENT` |
| Apakah domain mewajibkan password sebelum akun boleh aktif | lihat "Satu hal yang hanya bisa dijawab di sana" |
| Group yang menentukan peran portal | `AD_GROUP_HC`, `AD_GROUP_ADMIN`, … |
| Group tim CISO | `CISO_APPROVER_GROUP` |

**Hak akun layanannya didelegasikan ke OU tertentu saja** — jangan dimasukkan
ke Domain Admins. Itu justru yang sedang dijaga oleh `AD_MANAGED_OUS`.

**OU per divisi.** Divisi yang dipilih HC di form menentukan OU akun barunya,
dan pindah divisi memindahkan akunnya ke OU divisi baru. Contoh:

```
AD_DEPARTMENT_OUS=Finance=>OU=Finance,OU=Karyawan,DC=...;IT — Engineering=>OU=Engineering,OU=Karyawan,DC=...
AD_DEPARTMENT_OU_PARENT=OU=Karyawan,DC=...
```

Baris pertama memetakan divisi satu per satu; baris kedua untuk divisi lain
yang OU-nya bernama sama persis dengan nama divisinya. Divisi yang tidak
tercakup masuk `AD_OU_STANDARD`. **Semua OU divisi harus ada di dalam
`AD_MANAGED_OUS`**, dan akun layanan harus didelegasikan di sana juga.

### Langkah 2 — Isi berkasnya

Satu template per keadaan. Kuncinya sama; template server berisi pengaturan
yang hanya berlaku di production:

| Berkas | Untuk |
|---|---|
| `.env.onprem.example` | **PC kantor, uji coba** — salin isinya ke `.env.local`. |
| `deploy/windows/env.production.example` | **Server internal, production** — salin jadi `.env.production.local`. Urutannya di [deploy/windows/README.md](deploy/windows/README.md). |

Template itu sudah berisi semua kunci yang dibutuhkan beserta keterangannya.
`.env.example` adalah rujukan lengkap kalau ada yang ingin ditelusuri.

Yang **wajib** diisi, dan portal akan menyebut namanya satu per satu kalau ada
yang kosong:

```
AD_DRIVER=ldap
AD_LDAP_URL=ldaps://dc.perusahaan.internal:636
AD_BASE_DN=DC=perusahaan,DC=internal
AD_BIND_DN=CN=svc-hc-portal,OU=Service Accounts,DC=perusahaan,DC=internal
AD_BIND_PASSWORD=<dari tim AD>
LDAP_CA_CERT_PATH=C:\certs\corp-root-ca.pem
AD_MANAGED_OUS=OU=Karyawan,DC=...;OU=Karantina,DC=...
AD_LDAP_WRITE_ENABLED=false        <-- biarkan false dulu
```

Hanya `ldaps://` port 636 yang diterima, sertifikatnya diverifikasi, dan nama
host-nya dicocokkan. Tidak ada cara mematikan itu — kata sandi akun layanan
melewati koneksi ini pada setiap operasi.

### Langkah 3 — Uji baca saja

```bash
npm run ad:service-check -- <sAMAccountName> "<DN group CISO>"
```

Skrip ini **tidak pernah menulis**, apa pun isi `AD_LDAP_WRITE_ENABLED`. Aman
diarahkan ke domain controller production sebelum yang lain. Yang diperiksanya:

```
✓ bind akun layanan berhasil
✓ akun <nama> ditemukan
✓ objectGUID terbaca sebagai biner
✓ userAccountControl terbaca
✓ objek berada di dalam AD_MANAGED_OUS
✓ anggota group bisa dimintai persetujuan
```

Kalau ada yang ✗, berhenti di sini — itu bukan masalah portal, itu konfigurasi
atau hak yang belum benar.

### Langkah 4 — Periksa hasilnya

Login ke portal. Yang harus benar:

- Bisa masuk dengan akun AD sungguhan (bukan `admin`).
- Peran portalnya benar — kalau kosong, `AD_GROUP_*` belum cocok dengan group
  yang sebenarnya dipegang akun itu.
- Direktori karyawan terbaca.
- Di `/status-ad`, pemeriksaan **OU per divisi** hijau: setiap OU divisi ada di
  AD dan berada di dalam `AD_MANAGED_OUS`. Divisi yang disebut "belum punya
  OU" akan gagal saat onboarding sampai OU-nya dibuat atau dipetakan.

### Langkah 5 — Nyalakan sakelar tulis

```
AD_LDAP_WRITE_ENABLED=true
```

Baru setelah ini portal boleh mengubah direktori. Yang dibatasi:

- Penulisan hanya di dalam `AD_MANAGED_OUS`. Objek atau OU tujuan di luar itu
  ditolak **tanpa menulis apa pun**.
- Keanggotaan group dibatasi lebih ketat lagi: hanya DN group yang diterbitkan
  katalog akses (`AD_ACCESS_GROUP_*`).
- Filter LDAP selalu di-escape. Nama akun `*` tidak pernah berarti "semua objek".

### Satu hal yang hanya bisa dijawab di sana

**Kebijakan password domain Anda** menentukan apakah langkah `enable-account`
bisa berhasil. Driver ini tidak pernah menulis password — bukan `unicodePwd`,
bukan kata sandi karangan, bukan `PASSWD_NOTREQD`. Konsekuensinya jujur: kalau
domain mewajibkan password sebelum akun boleh aktif, langkah itu akan **ditolak
direktori**, pengajuan berakhir `FAILED` dengan alasan asli dari AD, dan
akunnya tetap ada dalam keadaan nonaktif.

Itu hasil yang benar, bukan kekurangan. Yang memegang penerbitan password
mengisinya, lalu langkah itu diulang dari titik yang sama.

---

---

## Bagian 3 — Di server, mode production

Bagian 1 menjalankan mode demo (`next dev`). Server internal menjalankan mode
production sebagai **Windows Service** — Node menjalankan `next start`, diawasi
NSSM, menyala sendiri saat boot — dengan **satu panduan langkah demi langkah:
[deploy/windows/README.md](deploy/windows/README.md)**. Bagian ini hanya
menjelaskan apa bedanya.

Bedanya dengan mode demo bukan sekadar optimasi:

| | demo | production |
|---|---|---|
| Perintah | `next dev` | `next build` + `next start` |
| Direktori | belum ada — worker diam sampai AD disambungkan | AD sungguhan, wajib |
| Email | ditulis ke berkas | SMTP — `file` **ditolak** |
| Login | daftar demo boleh | tanpa `LDAP_URL` **melempar error** |
| Cookie sesi | biasa | `secure` — **butuh TLS di depannya** |
| Cara jalan | jendela `jalankan.bat` | Windows Service, akun virtual tanpa password |

**TLS tidak ada di dalam service itu, dan itu bukan kelupaan.** Cookie sesi
membawa `secure`, jadi browser tidak akan mengirimnya balik lewat http dan
tidak ada yang bisa tetap login. Terminasi TLS di depannya — IIS, nginx, apa
pun yang sudah dipakai perusahaan — lalu arahkan `APP_BASE_URL` ke alamat
https-nya, karena setiap tautan persetujuan di email dibangun dari nilai itu.

**Jangan di-scale lebih dari satu instance.** Kunci klaim job itu per-proses;
dua instance pada data yang sama berarti dua worker sama-sama merasa memegang
satu job yang sama.

### Mendirikan AD uji coba sendiri

Seluruh jalur on-premise di Bagian 2 sudah dibuktikan ke domain controller
sungguhan — Samba AD DC, bukan simulasi:

```
✓ bind akun layanan berhasil
✓ objectGUID terbaca sebagai biner
✓ objek berada di dalam AD_MANAGED_OUS
✓ anggota group bisa dimintai persetujuan
```

lalu siklus penuhnya dengan sakelar tulis dinyalakan — buat akun, isi atribut,
beri group, aktifkan, pindah ke karantina, nonaktifkan: **11 dari 11 lolos**,
dan hasilnya diperiksa langsung ke direktorinya, bukan lewat aplikasi.

Hak akun layanannya **didelegasikan ke OU tertentu saja** lewat
`samba-tool dsacl set`, bukan dengan memasukkannya ke Domain Admins — itu
justru yang sedang ditunjukkan oleh `AD_MANAGED_OUS`.

Untuk mendirikan ulang, jalankan `src/lib/ad/ldapLive.test.ts` dengan
`AD_LIVE_TEST=true` setelah `.env`-nya diarahkan ke DC itu. Tes itu **mati
secara default** dan tidak ikut `npm test`.

---

## Yang belum ada

**Worker terpisah.** Sekarang worker berjalan di dalam proses portal yang sama.
Topologi yang direncanakan — satu proses kecil **di dalam jaringan perusahaan**
yang mengambil job dari portal lewat API dengan mTLS — belum dibuat.

Artinya untuk sekarang portal harus berjalan di mesin yang bisa menjangkau
domain controller lewat port 636. Itu sudah cukup untuk pilot; yang belum
adalah pemisahan prosesnya.

Di luar production worker berjalan otomatis. Di production ia **mati** kecuali
`WORKER_POLL_SECONDS` diisi, karena kuncinya per-proses dan dua instance pada
data yang sama bisa saling tabrak.

---

## Kalau ada yang salah

| Gejala | Biasanya karena |
|---|---|
| `AD_DRIVER=ldap membutuhkan variabel berikut…` | Ada kunci wajib yang kosong — pesannya menyebut namanya |
| `Sertifikat domain controller tidak lolos verifikasi` | `LDAP_CA_CERT_PATH` salah, atau nama host di URL tidak cocok sertifikat |
| `Penulisan ke Active Directory dimatikan` | `AD_LDAP_WRITE_ENABLED` belum `true`. Ini normal di langkah 3-4 |
| `… di luar AD_MANAGED_OUS` | Objek atau OU tujuan di luar daftar yang diizinkan |
| `Group … tidak diterbitkan katalog akses` | DN group tidak cocok `AD_ACCESS_GROUP_*` |
| Login berhasil tapi semua menu kosong | `AD_GROUP_*` tidak cocok group yang dipegang akun itu |
| Portal tidak menjawab setelah PC di-restart | Normal — klik dua kali `jalankan.bat` lagi |
| Service `HCUserManagement` tidak mau start | Lihat `logs\service.err.log` di folder aplikasi |
