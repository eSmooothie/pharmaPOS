"""
PharmaPOS launcher — runs as a Windows system-tray app.
Starts the FastAPI server in a background thread and opens the browser once
the server is ready.  Right-click the tray icon to open the app or quit.
"""

import ctypes
import json
import logging
import logging.handlers
import os
import socket
import sys
import threading
import time
import traceback
import urllib.request
import webbrowser
from datetime import datetime
from pathlib import Path

import pystray
from PIL import Image, ImageDraw

# ── Paths ─────────────────────────────────────────────────────────────────────

# When frozen by PyInstaller, sys._MEIPASS is the temp bundle directory.
BASE_DIR: Path = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))

# User-writable data directory (survives app updates)
DATA_DIR: Path = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "PharmaPOS"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── Logging ───────────────────────────────────────────────────────────────────

LOGS_DIR = DATA_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Prune log files older than 14 days
_cutoff = time.time() - 14 * 86_400
for _old_log in LOGS_DIR.glob("log_*.log"):
    try:
        if _old_log.stat().st_mtime < _cutoff:
            _old_log.unlink()
    except OSError:
        pass

# One log file per day; append if the app is restarted on the same day.
LOG_FILE = LOGS_DIR / f"log_{datetime.now().strftime('%Y-%m-%d')}.log"

_log_handler = logging.FileHandler(str(LOG_FILE), encoding="utf-8")
_log_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
logging.root.setLevel(logging.INFO)
logging.root.addHandler(_log_handler)
_log = logging.getLogger("pharmapos.launcher")

# ── stdout / stderr redirect ──────────────────────────────────────────────────
# When built with console=False, sys.stdout/stderr are None.
# Route writes through the rotating logger so they respect the size limit.

class _LogWriter:
    def __init__(self, logger, level):
        self._log = logger
        self._level = level
        self.encoding = "utf-8"

    def write(self, msg):
        if msg.rstrip():
            self._log.log(self._level, msg.rstrip())

    def flush(self):
        pass

    def isatty(self):
        return False


if sys.stdout is None:
    sys.stdout = _LogWriter(logging.getLogger("stdout"), logging.INFO)
if sys.stderr is None:
    sys.stderr = _LogWriter(logging.getLogger("stderr"), logging.WARNING)

# Expose paths to the backend via environment variables
os.environ["PHARMAPOS_BASE_DIR"] = str(BASE_DIR)
os.environ["PHARMAPOS_DATA_DIR"] = str(DATA_DIR)

HOST = "127.0.0.1"
PORT = 8000
APP_URL = f"http://{HOST}:{PORT}"
GITHUB_REPO = "eSmooothie/pharmaPOS"


def _alert(title: str, message: str):
    """Show a Windows error message box."""
    ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)  # MB_ICONERROR


# ── Server ────────────────────────────────────────────────────────────────────

# Flag set by the server thread if startup fails
_server_error: str | None = None


def _run_server():
    global _server_error
    try:
        # Add the bundled backend directory to sys.path
        backend_dir = str(BASE_DIR / "backend")
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)

        _log.info("Starting backend from: %s", backend_dir)

        # Import the app object directly — more reliable than a string import
        # inside a frozen bundle where module discovery can fail.
        from main import app  # noqa: PLC0415
        import uvicorn        # noqa: PLC0415

        _log.info("uvicorn starting on %s:%s", HOST, PORT)
        uvicorn.run(
            app,
            host=HOST,
            port=PORT,
            log_level="info",
            reload=False,
        )
    except Exception:
        _server_error = traceback.format_exc()
        _log.error("Server crashed:\n%s", _server_error)


def _wait_for_server(timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((HOST, PORT), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False


# ── Auto-updater ──────────────────────────────────────────────────────────────

def _current_version() -> str:
    try:
        return (BASE_DIR / "version.txt").read_text().strip()
    except Exception:
        return "0.0.0"


def _parse_version(v: str) -> tuple:
    v = v.lstrip("v")
    return tuple(int(x) for x in v.split(".") if x.isdigit())


def _check_for_updates(silent: bool = True):
    """Check GitHub releases for a newer version.

    silent=True  → only notify if an update is found (used on startup).
    silent=False → always notify (used from tray menu).
    """
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        req = urllib.request.Request(url, headers={"User-Agent": "PharmaPOS-Updater"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        latest_tag = data.get("tag_name", "")
        html_url = data.get("html_url", f"https://github.com/{GITHUB_REPO}/releases/latest")
        current = _parse_version(_current_version())
        latest = _parse_version(latest_tag)

        if latest > current:
            result = ctypes.windll.user32.MessageBoxW(
                0,
                f"A new version of PharmaPOS is available: {latest_tag}\n"
                f"Current version: {_current_version()}\n\n"
                f"Do you want to open the download page?",
                "Update Available",
                0x24,  # MB_YESNO | MB_ICONQUESTION
            )
            if result == 6:  # IDYES
                webbrowser.open(html_url)
        elif not silent:
            ctypes.windll.user32.MessageBoxW(
                0,
                f"PharmaPOS is up to date.\n\nVersion: {_current_version()}",
                "No Updates",
                0x40,  # MB_ICONINFORMATION
            )
    except Exception as e:
        _log.warning("Update check failed: %s", e)
        if not silent:
            ctypes.windll.user32.MessageBoxW(
                0,
                f"Could not check for updates.\n\n{e}",
                "Update Check Failed",
                0x10,  # MB_ICONERROR
            )


def _check_updates_background():
    """Run the update check in a background thread (used on startup)."""
    threading.Thread(target=_check_for_updates, kwargs={"silent": True}, daemon=True).start()


# ── Tray icon ─────────────────────────────────────────────────────────────────

def _make_icon_image() -> Image.Image:
    ico_path = BASE_DIR / "pharmapos.ico"
    if ico_path.exists():
        return Image.open(ico_path).convert("RGBA").resize((64, 64))

    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([2, 2, 62, 62], fill=(79, 70, 229, 255))
    draw.rectangle([28, 14, 36, 50], fill=(255, 255, 255, 255))
    draw.rectangle([14, 28, 50, 36], fill=(255, 255, 255, 255))
    return img


def _open_app(icon, item):  # noqa: ARG001
    webbrowser.open(APP_URL)


def _quit_app(icon, item):  # noqa: ARG001
    icon.stop()


def _run_tray():
    def _on_check_updates(icon, item):  # noqa: ARG001
        threading.Thread(target=_check_for_updates, kwargs={"silent": False}, daemon=True).start()

    menu = pystray.Menu(
        pystray.MenuItem("Open PharmaPOS", _open_app, default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Check for Updates", _on_check_updates),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", _quit_app),
    )
    icon = pystray.Icon("PharmaPOS", _make_icon_image(), "PharmaPOS", menu)
    icon.run()


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    _log.info("PharmaPOS launcher starting — BASE_DIR=%s  DATA_DIR=%s", BASE_DIR, DATA_DIR)

    server_thread = threading.Thread(target=_run_server, daemon=True)
    server_thread.start()

    if _wait_for_server():
        _log.info("Server ready — opening browser")
        webbrowser.open(APP_URL)
        _check_updates_background()
    else:
        # Server did not become ready in time — show an actionable error
        detail = _server_error or "The server did not respond within 30 seconds."
        _log.error("Server failed to start: %s", detail)
        _alert(
            "PharmaPOS failed to start",
            f"The server could not be started.\n\n"
            f"See the log for details:\n{LOG_FILE}\n\n"
            f"{detail[:400]}",
        )
        return

    _run_tray()


if __name__ == "__main__":
    main()
