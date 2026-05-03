@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

:: Read version from version.txt (trim trailing whitespace/newline)
set /p VERSION=<version.txt
for /f "tokens=* delims= " %%a in ("%VERSION%") do set VERSION=%%a

echo ============================================================
echo  PharmaPOS Build Script  ^|  v%VERSION%
echo ============================================================

:: ── 1. Build React frontend ──────────────────────────────────
echo.
echo [1/4] Building React frontend...
cd frontend
call npm install --silent
if errorlevel 1 ( echo ERROR: npm install failed & exit /b 1 )
call npm run build
if errorlevel 1 ( echo ERROR: npm build failed & exit /b 1 )
cd ..
echo       Done.

:: ── 2. Install Python deps ───────────────────────────────────
echo.
echo [2/4] Installing Python dependencies...
pip install -r backend\requirements.txt --quiet
if errorlevel 1 ( echo ERROR: pip install failed & exit /b 1 )
pip install pyinstaller --quiet
if errorlevel 1 ( echo ERROR: pip install pyinstaller failed & exit /b 1 )
echo       Done.

:: ── 3. Generate icon ─────────────────────────────────────────
echo.
echo [3/4] Generating application icon...
python installer\make_icon.py
if errorlevel 1 ( echo WARNING: icon generation failed, build will continue without custom icon )

:: ── 4. PyInstaller bundle ────────────────────────────────────
echo.
echo [4/4] Bundling with PyInstaller...

:: Kill any running instance so the dist folder is not locked
taskkill /f /im PharmaPOS.exe >nul 2>&1

:: Force-remove old dist so PyInstaller doesn't hit permission errors
if exist dist\PharmaPOS ( rmdir /s /q dist\PharmaPOS )

pyinstaller launcher.spec --noconfirm
if errorlevel 1 ( echo ERROR: PyInstaller failed & exit /b 1 )
echo       Done.  Bundle at: dist\PharmaPOS\

:: ── 5. Inno Setup installer ──────────────────────────────────
echo.
echo [5/4] Creating Windows installer with Inno Setup...

:: Try common Inno Setup locations
set ISCC=
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"              set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if exist "C:\Program Files\Inno Setup 6\ISCC.exe"                    set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"             set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"

if "!ISCC!"=="" (
    echo WARNING: Inno Setup not found. Skipping installer creation.
    echo          Download from https://jrsoftware.org/isdl.php then re-run this step:
    echo          "%%LOCALAPPDATA%%\Programs\Inno Setup 6\ISCC.exe" installer\installer.iss
) else (
    "!ISCC!" /DAppVersion=!VERSION! installer\installer.iss
    if errorlevel 1 ( echo ERROR: Inno Setup failed & exit /b 1 )
    echo       Installer: installer\Output\PharmaPOS-Setup-!VERSION!.exe
)

echo.
echo ============================================================
echo  Build complete!
echo ============================================================
