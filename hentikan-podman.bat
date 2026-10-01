@echo off
REM ---------------------------------------------------------------------------
REM  Menghentikan portal yang dijalankan dengan Podman.
REM
REM  Dipanggil sebelum menyalin folder ini ke komputer lain: salinan yang
REM  diambil saat penjadwal outbox sedang menulis ke data\ adalah salinan
REM  berkas setengah tertulis.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

set "MESIN=podman-machine-default"

wsl -d %MESIN% -u root -- true >nul 2>&1
if not %errorlevel%==0 (
  echo  Mesin Podman tidak ada. Tidak ada yang perlu dihentikan.
  pause
  exit /b 0
)

for /f "delims=" %%p in ('wsl -d %MESIN% -u root -e wslpath -a "%CD%"') do set "DIRLINUX=%%p"

echo  Menghentikan portal...
wsl -d %MESIN% -u root -- sh -lc "cd '%DIRLINUX%' && PODMAN_IGNORE_CGROUPSV1_WARNING=1 podman-compose down"

echo.
echo  Portal dihentikan. Datanya tetap di folder data\.
echo.
pause
