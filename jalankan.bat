@echo off
REM ---------------------------------------------------------------------------
REM  Menjalankan portal tanpa container. Klik dua kali berkas ini.
REM
REM  Portal ini aplikasi Next.js biasa yang berjalan di atas Node.js.
REM
REM  Node.js dicari di dua tempat, sehingga komputer tanpa hak admin pun bisa:
REM    1. folder "node" di sebelah berkas ini (unduh Node versi .zip dari
REM       nodejs.org, ekstrak ke situ) - tidak perlu dipasang;
REM    2. Node.js yang sudah terpasang di komputer.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

if exist "node\node.exe" (
  set "PATH=%CD%\node;%PATH%"
  echo Memakai Node.js portabel dari folder "node".
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js tidak ditemukan.
  echo.
  echo  Pilihan 1 ^(tanpa hak admin^): unduh "Windows Binary (.zip)" dari
  echo    https://nodejs.org  lalu ekstrak isinya ke folder "node" di sebelah
  echo    berkas ini, sehingga ada "node\node.exe".
  echo  Pilihan 2: pasang Node.js 22 seperti biasa.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\next" (
  echo Memasang dependency ^(sekali saja, perlu koneksi internet^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo  Pemasangan gagal. Bila jaringan kantor memblokir npm, salin folder
    echo  "node_modules" dari komputer lain lewat flashdisk, lalu jalankan
    echo  berkas ini lagi.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo  Portal berjalan di  http://localhost:3000
echo  Login: admin / admin12345   - selama AD belum disambungkan
echo  Tekan Ctrl+C untuk menghentikan.
echo.

call npm run dev
pause
