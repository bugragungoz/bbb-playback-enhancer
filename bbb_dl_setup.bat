@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
echo ============================================
echo   BBB-DL Kurulum Scripti (Brave / Chrome)
echo   Admin gerektirmez
echo ============================================
echo.

:: ---- Python kontrolü ----
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [HATA] Python bulunamadi.
    echo Lutfen https://www.python.org/downloads/ adresinden yukleyin.
    pause & exit /b 1
)
echo [OK] Python bulundu.
for /f "tokens=*" %%i in ('python -c "import sys; print(sys.executable)"') do set PYTHON_EXE=%%i
echo [OK] Python yolu: !PYTHON_EXE!

:: ---- bbb-dl kurulumu ----
echo.
echo [*] bbb-dl kuruluyor...
pip install -U bbb-dl
if %ERRORLEVEL% neq 0 (
    echo [HATA] bbb-dl kurulumu basarisiz.
    pause & exit /b 1
)
echo [OK] bbb-dl kuruldu.

:: ---- bbb-dl PATH kontrolü ve düzeltmesi ----
bbb-dl --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [*] bbb-dl PATH'e ekleniyor...
    for /f "tokens=*" %%i in ('python -c "import site; print(site.getusersitepackages().replace(\"site-packages\",\"Scripts\"))"') do set SCRIPTS_DIR=%%i
    setx PATH "!PATH!;!SCRIPTS_DIR!" >nul 2>&1
    echo [OK] PATH guncellendi: !SCRIPTS_DIR!
    echo     (Bu terminali kapatip acmaniz gerekebilir)
) else (
    echo [OK] bbb-dl PATH'de zaten mevcut.
)

:: ---- Playwright Chromium ----
echo.
echo [*] Playwright Chromium kontrol ediliyor...
python -m playwright install chromium
echo [OK] Playwright Chromium hazir.

:: ---- Cikis klasoru ----
if not exist "C:\croxz" mkdir "C:\croxz"
echo [OK] Cikis klasoru: C:\croxz\

:: ---- Host wrapper .bat olustur ----
:: Bu dosya Chrome/Brave tarafindan dogrudan cagrilir
set WRAPPER=%~dp0bbb_dl_host_run.bat
(
echo @echo off
echo "!PYTHON_EXE!" "%%~dp0bbb_dl_host.py"
) > "!WRAPPER!"
echo [OK] Host wrapper olusturuldu: !WRAPPER!

:: ---- Native Messaging manifest olustur ----
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
echo [OK] Manifest olusturuldu: !MANIFEST_FILE!

:: ---- Windows REGISTRY kaydı (zorunlu, klasor koymak yetmiyor) ----
echo.
echo [*] Windows registry'e kayit yapiliyor...

:: Brave
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.bbbtool.downloader" /ve /t REG_SZ /d "!MANIFEST_FILE!" /f >nul
echo [OK] Brave registry kaydedildi.

:: Chrome (varsa)
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.bbbtool.downloader" /ve /t REG_SZ /d "!MANIFEST_FILE!" /f >nul
echo [OK] Chrome registry kaydedildi.

:: ---- Uzanti ID'si al ve manifest guncelle ----
echo.
echo ============================================
echo   Son adim: Uzanti ID
echo ============================================
echo.
echo 1. Brave'i ac: brave://extensions
echo 2. "Gelistirici modunu" ac (sag ust)
echo 3. "Paketlenmemis ogeyi yukle" ile secin:
echo    !~dp0
echo 4. Gorünen 32 karakterlik ID'yi asagiya girin:
echo.
set /p EXT_ID="Uzanti ID: "

if "!EXT_ID!"=="" (
    echo [UYARI] ID girilmedi. Sonradan tekrar calistirabilirsiniz.
    goto done
)

:: Manifest'i guncelle - allowed_origins ile
(
echo {
echo   "name": "com.bbbtool.downloader",
echo   "description": "BBB-DL Native Messaging Host",
echo   "path": "!WRAPPER_ESCAPED!",
echo   "type": "stdio",
echo   "allowed_origins": ["chrome-extension://!EXT_ID!/"]
echo }
) > "!MANIFEST_FILE!"
echo [OK] Manifest guncellendi, uzanti izni eklendi.

:done
echo.
echo ============================================
echo   Kurulum tamamlandi!
echo   Cikti klasoru: C:\croxz\
echo ============================================
pause
