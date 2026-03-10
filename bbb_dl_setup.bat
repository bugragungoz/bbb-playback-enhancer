@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
echo ============================================
echo   BBB-DL Setup Script (Brave / Chrome)
echo   No admin privileges required
echo ============================================
echo.

:: ---- Python check ----
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found.
    echo Please install it from https://www.python.org/downloads/
    pause & exit /b 1
)
echo [OK] Python found.
for /f "tokens=*" %%i in ('python -c "import sys; print(sys.executable)"') do set PYTHON_EXE=%%i
echo [OK] Python path: !PYTHON_EXE!

:: ---- bbb-dl installation ----
echo.
echo [*] Installing bbb-dl...
pip install -U bbb-dl
if %ERRORLEVEL% neq 0 (
    echo [ERROR] bbb-dl installation failed.
    pause & exit /b 1
)
echo [OK] bbb-dl installed.

:: ---- bbb-dl PATH check and fix ----
bbb-dl --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [*] Adding bbb-dl to PATH...
    for /f "tokens=*" %%i in ('python -c "import site; print(site.getusersitepackages().replace(\"site-packages\",\"Scripts\"))"') do set SCRIPTS_DIR=%%i
    setx PATH "!PATH!;!SCRIPTS_DIR!" >nul 2>&1
    echo [OK] PATH updated: !SCRIPTS_DIR!
    echo     (You may need to close and reopen this terminal)
) else (
    echo [OK] bbb-dl is already on PATH.
)

:: ---- Playwright Chromium ----
echo.
echo [*] Checking Playwright Chromium...
python -m playwright install chromium
echo [OK] Playwright Chromium ready.

:: ---- Output directory ----
if not exist "C:\croxz" mkdir "C:\croxz"
echo [OK] Output directory: C:\croxz\

:: ---- Create host wrapper .bat ----
:: This file is called directly by Chrome/Brave
set WRAPPER=%~dp0bbb_dl_host_run.bat
(
echo @echo off
echo "!PYTHON_EXE!" "%%~dp0bbb_dl_host.py"
) > "!WRAPPER!"
echo [OK] Host wrapper created: !WRAPPER!

:: ---- Create Native Messaging manifest ----
set MANIFEST_FILE=%~dp0com.bbbtool.downloader.json
set WRAPPER_ESCAPED=!WRAPPER:\=\\!
(
echo {
echo   "name": "com.bbbtool.downloader",
echo   "description": "BBB-DL Native Messaging Host",
echo   "path": "!WRAPPER_ESCAPED!",
echo   "type": "stdio",
echo   "allowed_origins": []
echo }
) > "!MANIFEST_FILE!"
echo [OK] Manifest created: !MANIFEST_FILE!

:: ---- Windows REGISTRY entry (required, folder alone is not enough) ----
echo.
echo [*] Registering in Windows registry...

:: Brave
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.bbbtool.downloader" /ve /t REG_SZ /d "!MANIFEST_FILE!" /f >nul
echo [OK] Brave registry entry added.

:: Chrome (if installed)
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.bbbtool.downloader" /ve /t REG_SZ /d "!MANIFEST_FILE!" /f >nul
echo [OK] Chrome registry entry added.

:: ---- Get extension ID and update manifest ----
echo.
echo ============================================
echo   Final step: Extension ID
echo ============================================
echo.
echo 1. Open brave://extensions (or chrome://extensions)
echo 2. Enable "Developer mode" (top-right toggle)
echo 3. Click "Load unpacked" and select this folder:
echo    !~dp0
echo 4. Enter the 32-character ID shown below the extension name:
echo.
set /p EXT_ID="Extension ID: "

if "!EXT_ID!"=="" (
    echo [WARNING] No ID entered. You can re-run this script later.
    goto done
)

:: Update manifest with allowed_origins
(
echo {
echo   "name": "com.bbbtool.downloader",
echo   "description": "BBB-DL Native Messaging Host",
echo   "path": "!WRAPPER_ESCAPED!",
echo   "type": "stdio",
echo   "allowed_origins": ["chrome-extension://!EXT_ID!/"]
echo }
) > "!MANIFEST_FILE!"
echo [OK] Manifest updated with extension permission.

:done
echo.
echo ============================================
echo   Setup complete!
echo   Output directory: C:\croxz\
echo ============================================
pause
