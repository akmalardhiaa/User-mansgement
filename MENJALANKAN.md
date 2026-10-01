# Menjalankan portal & menyambungkannya ke AD on-premise

Dua hal, dan urutannya penting: jalankan dulu dengan direktori simulasi, baru
sambungkan ke Active Directory sungguhan. Berkas ini satu-satunya yang perlu
dibuka untuk keduanya.

> README.md menjelaskan **kenapa** portal ini dibangun begini. Berkas ini
> menjelaskan **caranya menjalankan**. Kalau keduanya bertentangan, yang di
> sini lebih baru.

---

## Bagian 1 — Menjalankan di PC

Tiga cara. Pilih satu.

### A. Dengan Podman (disarankan)

Podman menggantikan Docker Desktop karena lisensinya: Docker Desktop berbayar
untuk perusahaan besar, Podman tidak. Containernya sama.

Sekali saja, pasang Podman:

```powershell
winget install -e --id RedHat.Podman
```

Lalu **klik dua kali `jalankan-podman.bat`**. Skrip itu membuat mesin Podman
bila belum ada, memasang `podman-compose` di dalamnya, lalu menjalankan portal.
Berhenti dengan `hentikan-podman.bat`.

Portal terbuka di **http://localhost:3000**. Login: `admin` / `admin12345`
atau `ayu.prameswari` / `mock12345`.

**Kalau Docker Desktop masih terpasang di PC yang sama**, dia akan menyuntikkan
WSL integration-nya ke distro milik Podman dan merusaknya. Gejalanya:

```
CreateFile \\.\pipe\podman-machine-default: All pipe instances are busy
Error: machine did not transition into running state: ssh error
```

Dialog Docker Desktop akan muncul menawarkan restart — pilih
**"Skip podman-machine-default WSL distro"**. Atau matikan Docker Desktop
sekalian, termasuk service-nya:

```powershell
Get-Service com.docker.service | Stop-Service -Force
```

`jalankan-podman.bat` sendiri sudah melewati jembatan yang rusak itu: ia
memanggil podman **di dalam** mesinnya, bukan dari sisi Windows.

### B. Tanpa container

Tidak butuh Podman, tidak butuh hak admin. **Klik dua kali `jalankan.bat`.**

Node.js belum ada dan tidak boleh memasang apa pun? Unduh Node 22 versi **.zip**
dari nodejs.org, ekstrak jadi folder `node` di sebelah `jalankan.bat`. Skrip itu
memakainya tanpa perlu dipasang.

Jaringan kantor memblokir npm? Salin folder `node_modules` dari komputer lain —
lihat bagian C.

### C. Memindahkan ke komputer lain

**Klik dua kali `siapkan-pindah.bat`**, isi tujuannya (mis. `E:\portal-hc`).

Yang ikut: kode, `node_modules`, `data/`, dan berkas `.env`. Yang tidak: `.next`
(cache build, dibuat ulang sendiri) dan `.git`. Hasilnya sekitar 490 MB.

Tiga hal yang mudah terlewat:

- **Jangan nyalakan di dua komputer sekaligus** pada data yang sama. Dua
  penjadwal outbox berarti satu email persetujuan terkirim dua kali.
- `.env.podman` dan `.env.local` berisi kata sandi. Pindahkan lewat **jalur
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
| Nama group untuk tiap profil akses | `AD_ACCESS_GROUP_*`, `AD_OU_*` |
| Group yang menentukan peran portal | `AD_GROUP_HC`, `AD_GROUP_ADMIN`, … |
| Group tim CISO | `CISO_APPROVER_GROUP` |

**Hak akun layanannya didelegasikan ke OU tertentu saja** — jangan dimasukkan
ke Domain Admins. Itu justru yang sedang dijaga oleh `AD_MANAGED_OUS`.

### Langkah 2 — Isi berkasnya

Ada dua template, pilih sesuai keadaan:

| Berkas | Untuk |
|---|---|
| `.env.pilot.example` | **PC kantor**, uji coba. Salin isinya ke `.env.local` |
| `.env.onprem.example` | **Server portal internal**, production. Salin jadi `.env.production` |

Keduanya sudah berisi semua kunci yang dibutuhkan beserta keterangannya.
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

- Bisa masuk dengan akun AD sungguhan (bukan `admin`/`mock`).
- Peran portalnya benar — kalau kosong, `AD_GROUP_*` belum cocok dengan group
  yang sebenarnya dipegang akun itu.
- Direktori karyawan terbaca.

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

Bagian 1 menjalankan mode demo (`next dev`). Untuk server internal, modenya
berbeda dan berkasnya memang dipisah:

```bash
podman-compose -f compose.prod.yaml up -d --build
```

Di server Linux, perintahnya sama dengan `docker compose` — **Docker Engine CE
itu gratis**; yang berbayar untuk perusahaan besar hanya Docker *Desktop*.

Bedanya dengan mode demo bukan sekadar optimasi:

| | demo | production |
|---|---|---|
| Perintah | `next dev` | `next build` + `next start` |
| Direktori | simulasi | AD sungguhan — mock **ditolak** |
| Email | ditulis ke berkas | SMTP — `file` **ditolak** |
| Login | daftar demo boleh | tanpa `LDAP_URL` **melempar error** |
| Cookie sesi | biasa | `secure` — **butuh TLS di depannya** |
| Pengguna di container | root | `node`, tanpa source & toolchain |

**TLS tidak ada di dalam compose itu, dan itu bukan kelupaan.** Cookie sesi
membawa `secure`, jadi browser tidak akan mengirimnya balik lewat http dan
tidak ada yang bisa tetap login. Terminasi TLS di depannya — IIS, nginx, apa
pun yang sudah dipakai perusahaan — lalu arahkan `APP_BASE_URL` ke alamat
https-nya, karena setiap tautan persetujuan di email dibangun dari nilai itu.

**Jangan di-scale lebih dari satu instance.** Kunci klaim job itu per-proses;
dua instance pada data yang sama berarti dua worker sama-sama merasa memegang
satu job yang sama.

### Kalau servernya Windows Server

Pertimbangkan **tanpa container sama sekali**. Aplikasi ini satu proses Node:
`npm run build` lalu `npm start`, dijadikan Windows Service. Tidak ada runtime
container yang perlu dilisensi, dipelihara, atau dijelaskan ke tim infra.

### Mendirikan AD uji coba sendiri

Seluruh jalur on-premise di Bagian 2 sudah dibuktikan ke domain controller
sungguhan — Samba AD DC, berjalan di bawah Podman, bukan simulasi:

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
| `All pipe instances are busy` saat menjalankan Podman | Docker Desktop merusak distro Podman — lihat Bagian 1A |
