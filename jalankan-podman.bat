@echo off
REM ---------------------------------------------------------------------------
REM  Menjalankan portal dengan Podman. Klik dua kali berkas ini.
REM
REM  Podman dipilih menggantikan Docker Desktop karena lisensinya: Docker
REM  Desktop berbayar untuk perusahaan besar, Podman tidak. Yang dijalankan
REM  tetap container yang sama dari Containerfile yang sama.
REM
REM  KENAPA LEWAT "wsl -d" DAN BUKAN "podman compose" LANGSUNG.
REM
REM  Di Windows, Podman menjalankan containernya di dalam sebuah mesin WSL, dan
REM  perintah podman dari sisi Windows menyambung ke mesin itu lewat SSH. Pada
REM  komputer yang pernah dipasangi Docker Desktop, jembatan SSH itu bisa gagal
REM  menyala - Docker Desktop menyuntikkan WSL integration-nya ke distro milik
REM  Podman, proxy-nya crash, dan pipe-nya tetap dipegang. Gejalanya:
REM
REM    CreateFile \\.\pipe\podman-machine-default: All pipe instances are busy
REM    Error: machine did not transition into running state: ssh error
REM
REM  Padahal podman DI DALAM mesinnya sehat. Jadi skrip ini memanggilnya di
REM  sana langsung dan melewati jembatan yang rusak itu. Hasilnya sama, dan
REM  tidak bergantung pada Docker Desktop sama sekali.
REM
REM  Bila Docker Desktop masih terpasang dan memunculkan dialog soal distro
REM  "podman-machine-default", pilih "Skip podman-machine-default WSL distro".
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

set "MESIN=podman-machine-default"

REM Podman dicari di PATH, lalu di lokasi pasangnya - PATH sebuah jendela yang
REM sudah terbuka tidak ikut diperbarui saat Podman baru dipasang, jadi tanpa
REM baris kedua ini skrip bilang "belum terpasang" padahal baru dipasang.
set "PODMAN="
for /f "delims=" %%p in ('where podman 2^>nul') do set "PODMAN=%%p"
if not defined PODMAN if exist "%ProgramFiles%\RedHat\Podman\podman.exe" set "PODMAN=%ProgramFiles%\RedHat\Podman\podman.exe"

if not defined PODMAN (
  echo.
  echo  Podman belum terpasang. Pasang sekali saja:
  echo.
  echo      winget install -e --id RedHat.Podman
  echo.
  echo  Lalu jalankan berkas ini lagi.
  pause
  exit /b 1
)

echo  [1/4] Memastikan mesin Podman ada...
wsl -d %MESIN% -u root -- true >nul 2>&1
if not %errorlevel%==0 (
  echo        Belum ada, membuat ^(sekali saja, beberapa menit^)...
  "%PODMAN%" machine init
  if errorlevel 1 (
    echo  Pembuatan mesin gagal. Pastikan WSL2 aktif: wsl --install
    pause
    exit /b 1
  )
)

echo  [2/4] Menyalakan mesinnya...
REM Menyentuh distronya sudah cukup untuk membangunkannya; podman di dalamnya
REM tidak butuh jembatan SSH dari Windows.
wsl -d %MESIN% -u root -- true >nul 2>&1
if not %errorlevel%==0 (
  echo.
  echo  Mesin Podman tidak bisa dinyalakan. Coba:
  echo      wsl --shutdown
  echo  lalu jalankan berkas ini lagi.
  pause
  exit /b 1
)

REM Letak folder ini seperti yang dilihat dari dalam mesin.
for /f "delims=" %%p in ('wsl -d %MESIN% -u root -e wslpath -a "%CD%"') do set "DIRLINUX=%%p"

echo  [3/4] Memastikan podman-compose ada di dalam mesin...
wsl -d %MESIN% -u root -- sh -lc "command -v podman-compose >/dev/null 2>&1" >nul 2>&1
if not %errorlevel%==0 (
  echo        Memasang podman-compose ^(sekali saja^)...
  wsl -d %MESIN% -u root -- sh -lc "dnf install -y podman-compose >/dev/null 2>&1"
  wsl -d %MESIN% -u root -- sh -lc "command -v podman-compose >/dev/null 2>&1"
  if not %errorlevel%==0 (
    echo  Pemasangan podman-compose gagal ^(perlu koneksi internet sekali^).
    pause
    exit /b 1
  )
)

echo  [4/4] Menjalankan portal...
echo.
wsl -d %MESIN% -u root -- sh -lc "cd '%DIRLINUX%' && PODMAN_IGNORE_CGROUPSV1_WARNING=1 podman-compose up -d"
if errorlevel 1 (
  echo.
  echo  Portal gagal dijalankan. Lihat pesan di atas.
  pause
  exit /b 1
)

echo.
echo  ==========================================================
echo   Portal berjalan di  http://localhost:3000
echo  ==========================================================
echo.
echo   Login:  admin / admin12345   - selama AD belum disambungkan
echo.
echo   Melihat log      :  matikan-podman.bat tidak perlu; jalankan
echo                       wsl -d %MESIN% -u root -- sh -lc "cd '%DIRLINUX%' && podman logs -f hc-portal"
echo   Menghentikan     :  hentikan-podman.bat
echo.
pause
