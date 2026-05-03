# PharmaPOS — Build Guide

This guide explains how to build the Windows installer (`PharmaPOS-Setup-x.y.z.exe`) from source.

---

## Prerequisites

Install these once on your **build machine** (not required on target machines).

| Tool | Version | Download |
|---|---|---|
| Python | 3.11 or newer | https://www.python.org/downloads/ |
| Node.js | 18 or newer | https://nodejs.org/ |
| Inno Setup 6 | latest | https://jrsoftware.org/isdl.php |

> **Inno Setup install path** — the build script checks the following locations automatically:
> - `C:\Program Files (x86)\Inno Setup 6\`
> - `C:\Program Files\Inno Setup 6\`
> - `%LOCALAPPDATA%\Programs\Inno Setup 6\` ← user-only install

Make sure Python and Node.js are on your `PATH` (check "Add to PATH" during their installers).

---

## Project structure

```
pos_system/
├── backend/          FastAPI app (Python)
├── frontend/         React/Vite app (JavaScript)
├── installer/
│   ├── build.bat     One-command build script
│   ├── installer.iss Inno Setup script
│   └── make_icon.py  Generates pharmapos.ico
├── launcher.py       Tray-app entry point (bundled by PyInstaller)
├── launcher.spec     PyInstaller configuration
└── version.txt       Version number — edit this before each release
```

---

## Building

### 1. Set the version

Open `version.txt` and update the version number before building a release:

```
1.0.1
```

Use `MAJOR.MINOR.PATCH` format. This value is stamped into the EXE file properties, the installer filename, and the `/version` API endpoint automatically.

### 2. Run the build script

Open a Command Prompt in the `pos_system/` directory and run:

```bat
installer\build.bat
```

The script runs these steps in order:

| Step | What happens |
|---|---|
| 1 | `npm install` + `npm run build` — compiles the React frontend to `frontend/dist/` |
| 2 | `pip install` — installs Python dependencies + PyInstaller |
| 3 | Generates `installer/pharmapos.ico` via Pillow |
| 4 | `pyinstaller launcher.spec` — bundles everything into `dist/PharmaPOS/` |
| 5 | Inno Setup compiles `installer/installer.iss` → `installer/Output/PharmaPOS-Setup-x.y.z.exe` |

A successful build ends with:

```
============================================================
 Build complete!
============================================================
```

The installer is at:

```
installer\Output\PharmaPOS-Setup-1.0.0.exe
```

---

## What the installer does

- Installs `PharmaPOS.exe` and its bundled files to `%LOCALAPPDATA%\Programs\PharmaPOS\` (no admin rights needed)
- Creates a Start Menu shortcut, and optionally a desktop shortcut
- Offers to launch the app immediately after install

**No Python or Node.js is required on the target machine** — everything is bundled inside the installer.

---

## How the installed app works

1. Double-click **PharmaPOS** (Start Menu or desktop)
2. A tray icon appears in the system tray (bottom-right of the taskbar)
3. The default browser opens automatically at `http://localhost:8000`
4. Right-click the tray icon for **Open PharmaPOS**, **Check for Updates**, or **Quit**

**User data location:** All data (database, backups, config) is stored in:

```
%LOCALAPPDATA%\PharmaPOS\
```

This folder is preserved across updates and uninstalls. Delete it manually only if you want to wipe all data.

---

## Releasing an update

### Step 1 — Bump the version

Open `version.txt` and change the version number:

```
1.0.1
```

Use `MAJOR.MINOR.PATCH`:
- **PATCH** (`1.0.0 → 1.0.1`) — bug fixes
- **MINOR** (`1.0.0 → 1.1.0`) — new features, backwards compatible
- **MAJOR** (`1.0.0 → 2.0.0`) — breaking changes

### Step 2 — Build the installer

```bat
installer\build.bat
```

Output: `installer\Output\PharmaPOS-Setup-1.0.1.exe`

### Step 3 — Push the version bump to GitHub

```bat
git add version.txt
git commit -m "chore: bump version to 1.0.1"
git push
```

### Step 4 — Create a GitHub Release

1. Open your browser and go to:
   ```
   https://github.com/eSmooothie/pharmaPOS
   ```

2. Click **Releases** on the right sidebar (or go to `/releases`).

3. Click **"Draft a new release"** (top-right button).

4. In the **"Choose a tag"** dropdown, type `v1.0.1` and select **"Create new tag: v1.0.1 on publish"**.

   > The tag **must** start with `v` and match `version.txt` exactly — e.g., if `version.txt` is `1.0.1`, the tag must be `v1.0.1`.

5. Set **"Release title"** to something like `PharmaPOS v1.0.1`.

6. Optionally add release notes in the description box (what changed, bug fixes, etc.).

7. Under **"Attach binaries"**, drag and drop `installer\Output\PharmaPOS-Setup-1.0.1.exe` or click to browse.

8. Click **"Publish release"**.

---

Once published, installed copies of the app will detect the new release on their next startup and prompt the user to download it. Users can also trigger a manual check via **right-click tray icon → Check for Updates**.

## Updating an existing installation

Just run the new installer — it will overwrite the app files while leaving `%LOCALAPPDATA%\PharmaPOS\` untouched.

---

## Uninstalling

Go to **Windows Settings → Apps → PharmaPOS → Uninstall**.  
A reminder will appear with the path to your data folder in case you want to delete it.

---

## Troubleshooting

### Checking the log file

If the app doesn't work on a target machine, the first place to look is the log folder:

```
%LOCALAPPDATA%\PharmaPOS\logs\
```

Each day's log is saved as `log_YYYY-MM-DD.log`. Logs older than 14 days are deleted automatically on startup.

If the server failed to start, you will see an error message box pointing to this file, and the full Python traceback inside it.

---

**"npm is not recognized"** — Node.js is not on PATH. Re-run the Node.js installer and check "Add to PATH".

**"pip is not recognized"** — Python is not on PATH. Re-run the Python installer and check "Add to PATH".

**"Inno Setup not found"** — The build script could not locate `ISCC.exe`. Run the Inno Setup installer or adjust the path check in `installer/build.bat`.

**PyInstaller build fails with missing module** — Add the module to `hiddenimports` in `launcher.spec`.

**App opens blank page / connection refused** — The backend failed to start. Check `%LOCALAPPDATA%\PharmaPOS\pharmapos.log` for the error.

**Port 8000 already in use** — Another process is on that port. Either stop it or change `PORT = 8000` in `launcher.py` (and update the frontend `api.js` base URL accordingly).
