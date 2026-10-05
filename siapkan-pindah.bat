@echo off
REM ---------------------------------------------------------------------------
REM  Menyiapkan salinan portal untuk dipindah ke komputer lain.
REM
REM  Klik dua kali, lalu isi tujuannya (mis. E:\portal-hc) - atau jalankan
REM  dengan tujuan sebagai argumen:  siapkan-pindah.bat E:\portal-hc
REM
REM  Yang ikut: kode, node_modules, data, dan berkas .env.
REM  Yang tidak: .next (cache build, 700+ MB, dibuat ulang sendiri) dan .git.
REM
REM  Kenapa node_modules ikut: di komputer yang jaringannya memblokir npm,
REM  itulah satu-satunya cara portal bisa jalan tanpa Podman dan tanpa admin.
REM
REM  Dua hal di bawah ini ada karena pernah salah, bukan karena kehati-hatian:
REM
REM    1. Pengecualian folder memakai path LENGKAP. Menulis /XD "node" saja
REM       mengecualikan setiap folder bernama "node" di mana pun - termasuk
REM       node_modules\@types\node dan @babel\generator\lib\node. Salinannya
REM       kehilangan 339 berkas, lolos dari pemeriksaan, dan baru gagal saat
REM       portal dijalankan di komputer tujuan.
REM
REM    2. Jumlah berkas node_modules dibandingkan setelah menyalin. Memeriksa
REM       beberapa berkas penanda tidak cukup: yang hilang tadi justru berkas
REM       yang tidak ada dalam daftar penanda mana pun.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

set "TUJUAN=%~1"
if "%TUJUAN%"=="" (
  echo.
  echo  Contoh tujuan:  E:\portal-hc
  set /p "TUJUAN=Tujuan salinan: "
)
if "%TUJUAN%"=="" (
  echo  Tujuan kosong. Dibatalkan.
  pause
  exit /b 1
)

echo.
echo  ==========================================================
echo   Menyiapkan salinan ke: %TUJUAN%
echo  ==========================================================
echo.

REM Portal yang sedang menulis ke data\ bisa menghasilkan salinan setengah
REM jadi. Dimatikan lewat hentikan-podman.bat - bukan "podman compose down"
REM dari Windows, karena jembatan SSH Windows ke mesin Podman tidak bisa
REM diandalkan dan kegagalannya diam. "<nul" melewati pause di skrip itu.
echo  [1/4] Menghentikan portal supaya tidak ada yang sedang menulis...
call hentikan-podman.bat <nul >nul 2>&1
echo        Kalau portal dijalankan dengan jalankan.bat, tutup dulu jendelanya.

echo  [2/4] Menyalin berkas ^(bisa beberapa menit untuk node_modules^)...
robocopy "." "%TUJUAN%" /MIR /NFL /NDL /NJH /NJS /NP ^
  /XD "%CD%\.next" "%CD%\.git" ^
  /XF "*.tsbuildinfo"
if errorlevel 8 (
  echo.
  echo  Penyalinan gagal. Periksa tujuannya masih punya ruang dan bisa ditulis.
  pause
  exit /b 1
)

echo  [3/4] Memeriksa yang wajib ada di salinan...
set "KURANG="
if not exist "%TUJUAN%\package.json"            set "KURANG=%KURANG% package.json"
if not exist "%TUJUAN%\node_modules\next"       set "KURANG=%KURANG% node_modules"
if not exist "%TUJUAN%\data\hc-store.json"      set "KURANG=%KURANG% data\hc-store.json"
if not exist "%TUJUAN%\jalankan.bat"            set "KURANG=%KURANG% jalankan.bat"
if not exist "%TUJUAN%\.env.development"        set "KURANG=%KURANG% .env.development"
if not exist "%TUJUAN%\compose.yaml"            set "KURANG=%KURANG% compose.yaml"

if not "%KURANG%"=="" (
  echo.
  echo  KURANG:%KURANG%
  echo  Salinan belum lengkap. Jangan dipakai sebelum ini beres.
  pause
  exit /b 1
)

REM Jumlah berkas node_modules harus sama persis. Satu berkas hilang di sini
REM berarti portal mati saat dijalankan, dengan pesan yang tidak menyebut
REM penyalinan sama sekali.
for /f %%a in ('dir /s /b /a-d "node_modules" 2^>nul ^| find /c /v ""') do set "ASAL=%%a"
for /f %%a in ('dir /s /b /a-d "%TUJUAN%\node_modules" 2^>nul ^| find /c /v ""') do set "SALIN=%%a"
echo        node_modules: %ASAL% berkas di sini, %SALIN% di salinan.
if not "%ASAL%"=="%SALIN%" (
  echo.
  echo  JUMLAHNYA BEDA. Salinan node_modules tidak lengkap - portal akan
  echo  gagal jalan di komputer tujuan. Jalankan berkas ini sekali lagi;
  echo  bila tetap beda, salin folder node_modules secara manual.
  pause
  exit /b 1
)
echo        Lengkap.

echo  [4/4] Memeriksa berkas rahasia...
if exist "%TUJUAN%\.env.podman" (
  echo        .env.podman ikut tersalin. Di dalamnya ada App Password Gmail -
  echo        jangan pernah kirim lewat chat atau unggah ke repositori.
) else (
  echo        .env.podman tidak ada. Tanpa berkas itu email ditulis sebagai
  echo        berkas ke data\outbox-mail\ dan seluruh alur tetap bisa didemokan.
)

echo.
echo  ==========================================================
echo   Selesai. Di komputer tujuan:
echo  ==========================================================
echo.
echo   Dengan Podman          ^>  klik dua kali jalankan-podman.bat
echo   Tanpa container        ^>  klik dua kali jalankan.bat
echo.
echo   Node.js belum ada dan tidak punya hak admin? Unduh Node 22 versi
echo   .zip dari nodejs.org, ekstrak jadi folder "node" di sebelah
echo   jalankan.bat. Tidak perlu dipasang.
echo.
echo   Login:  admin / admin12345   - selama AD belum disambungkan
echo.
echo   JANGAN menyalakan portal di dua komputer sekaligus pada data yang
echo   sama: dua penjadwal outbox berarti satu email persetujuan terkirim
echo   dua kali.
echo.
pause
