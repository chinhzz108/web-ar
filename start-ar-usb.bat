@echo off
setlocal EnableExtensions

title Mầm Book WebAR - USB

set "AR_ROOT=%~dp0"
set "AR_PORT=5173"
set "AR_URL=http://localhost:%AR_PORT%/?engine=zappar&fresh=bat"
set "AR_ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"

echo.
echo ========================================
echo   MAM BOOK WEBAR - USB STARTER
echo ========================================
echo.

if not exist "%AR_ADB%" (
  echo [LOI] Khong tim thay Android Platform-Tools:
  echo       %AR_ADB%
  echo.
  echo Cai Android Platform-Tools hoac sua AR_ADB trong file nay.
  pause
  exit /b 1
)

pushd "%AR_ROOT%"

echo [1/4] Khoi dong ADB...
"%AR_ADB%" start-server >nul

set "AR_DEVICE="
for /f "skip=1 tokens=1,2" %%A in ('"%AR_ADB%" devices 2^>nul') do (
  if "%%B"=="device" set "AR_DEVICE=%%A"
)

if not defined AR_DEVICE (
  echo [LOI] Chua thay dien thoai qua ADB.
  echo       Mo khoa may, chon File Transfer va Allow USB debugging.
  popd
  pause
  exit /b 1
)

echo       Thiet bi: %AR_DEVICE%

echo [2/4] Kiem tra Vite USB...
netstat -ano | findstr /R /C:":%AR_PORT% .*LISTENING" >nul
if errorlevel 1 (
  echo       Vite chua chay, dang khoi dong...
  start "Mam Book Vite" /D "%AR_ROOT%" cmd /k "npm run dev:usb -- --port %AR_PORT%"
  timeout /t 3 /nobreak >nul
) else (
  echo       Vite da dang chay tren cong %AR_PORT%.
)

echo [3/4] Noi cong USB tcp:%AR_PORT%...
"%AR_ADB%" -s "%AR_DEVICE%" reverse tcp:%AR_PORT% tcp:%AR_PORT%
if errorlevel 1 (
  echo [LOI] Khong tao duoc adb reverse.
  echo       Hay mo khoa dien thoai va cho phep USB debugging.
  popd
  pause
  exit /b 1
)

echo [4/4] Mo WebAR tren dien thoai...
"%AR_ADB%" -s "%AR_DEVICE%" shell am start -a android.intent.action.VIEW -d "%AR_URL%"

echo.
echo Da xong. Neu trinh duyet khong tu mo, vao thu cong:
echo %AR_URL%
echo.
echo Giu cua so Vite dang mo trong luc test. Nhan phim bat ky de dong cua so nay.
popd
pause
