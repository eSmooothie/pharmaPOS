import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import engine

router = APIRouter(prefix="/backup", tags=["backup"])

# Change this to your preferred backup access password
BACKUP_PASSWORD = "ph@rmA_2026"

# ── Paths ─────────────────────────────────────────────────────────────────────
# In frozen (installed) mode PHARMAPOS_DATA_DIR is set by launcher.py to a
# user-writable directory (e.g. %LOCALAPPDATA%\PharmaPOS).  In dev mode we
# fall back to the backend directory as before.

def _data_dir() -> Path:
    d = os.environ.get("PHARMAPOS_DATA_DIR")
    if d:
        p = Path(d)
        p.mkdir(parents=True, exist_ok=True)
        return p
    return Path(__file__).parent.parent


DB_PATH     = _data_dir() / "pharmacy.db"
CONFIG_PATH = _data_dir() / "backup_config.json"

DEFAULT_CONFIG = {
    "enabled": True,
    "interval_hours": 24,
    "retention_count": 14,
    "backup_dir": "backups",
}

scheduler = BackgroundScheduler()


# ── Config helpers ────────────────────────────────────────────────────────────

def read_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return {**DEFAULT_CONFIG, **json.load(f)}
    return DEFAULT_CONFIG.copy()


def write_config(config: dict):
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)


def get_backup_dir() -> Path:
    config = read_config()
    path = (_data_dir() / config["backup_dir"]).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


# ── Backup helpers ────────────────────────────────────────────────────────────

def _do_backup(dest: Path):
    src = sqlite3.connect(str(DB_PATH))
    dst = sqlite3.connect(str(dest))
    with dst:
        src.backup(dst)
    dst.close()
    src.close()


def _regular_backups(backup_dir: Path) -> list[Path]:
    """Return regular backup files sorted oldest-first (excludes pre-restore snapshots)."""
    return sorted(
        [f for f in backup_dir.glob("pharmacy_[0-9]*.db")],
        key=lambda f: f.stat().st_mtime,
    )


def _enforce_retention(backup_dir: Path, retention_count: int):
    files = _regular_backups(backup_dir)
    while len(files) > retention_count:
        files.pop(0).unlink()


def _last_backup_time(backup_dir: Path) -> datetime | None:
    files = _regular_backups(backup_dir)
    if not files:
        return None
    return datetime.fromtimestamp(files[-1].stat().st_mtime, tz=timezone.utc)


def run_backup() -> dict | None:
    """Create a backup. Returns file info dict, or None if backups are disabled."""
    config = read_config()
    if not config["enabled"]:
        return None

    backup_dir = get_backup_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    dest = backup_dir / f"pharmacy_{timestamp}.db"

    _do_backup(dest)
    _enforce_retention(backup_dir, config["retention_count"])

    stat = dest.stat()
    return {
        "filename": dest.name,
        "size": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "is_pre_restore": False,
    }


# ── Startup check + scheduler ─────────────────────────────────────────────────

def check_and_backup():
    """Run a backup if interval has elapsed since the last one."""
    config = read_config()
    if not config["enabled"]:
        return

    backup_dir = get_backup_dir()
    last = _last_backup_time(backup_dir)
    now = datetime.now(timezone.utc)

    if last is None or (now - last).total_seconds() >= config["interval_hours"] * 3600:
        run_backup()


def _reschedule():
    """Replace the hourly poller job (called after config change)."""
    if scheduler.get_job("backup_poller"):
        scheduler.remove_job("backup_poller")
    scheduler.add_job(check_and_backup, "interval", hours=1, id="backup_poller")


def start_scheduler():
    check_and_backup()  # Startup check: backup immediately if overdue
    scheduler.add_job(check_and_backup, "interval", hours=1, id="backup_poller")
    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)


# ── Schemas ───────────────────────────────────────────────────────────────────

class BackupConfigUpdate(BaseModel):
    enabled: bool | None = None
    interval_hours: int | None = None
    retention_count: int | None = None


class PasswordRequest(BaseModel):
    password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/verify-password")
def verify_password(payload: PasswordRequest):
    if payload.password != BACKUP_PASSWORD:
        raise HTTPException(401, "Incorrect password")
    return {"ok": True}


@router.get("/config")
def get_config():
    return read_config()


@router.put("/config")
def update_config(payload: BackupConfigUpdate):
    config = read_config()
    if payload.enabled is not None:
        config["enabled"] = payload.enabled
    if payload.interval_hours is not None:
        if payload.interval_hours < 1:
            raise HTTPException(422, "interval_hours must be at least 1")
        config["interval_hours"] = payload.interval_hours
    if payload.retention_count is not None:
        if payload.retention_count < 1:
            raise HTTPException(422, "retention_count must be at least 1")
        config["retention_count"] = payload.retention_count
    write_config(config)
    _reschedule()
    return config


@router.post("/now")
def manual_backup():
    result = run_backup()
    if result is None:
        raise HTTPException(400, "Automatic backups are disabled. Enable them first or re-enable to allow manual backups.")
    return result


@router.get("/list")
def list_backups():
    backup_dir = get_backup_dir()
    files = []
    for f in sorted(backup_dir.glob("pharmacy_*.db"), key=lambda x: x.stat().st_mtime, reverse=True):
        stat = f.stat()
        files.append({
            "filename": f.name,
            "size": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "is_pre_restore": "pre_restore" in f.name,
        })
    return files


@router.post("/restore/{filename}")
def restore_backup(filename: str):
    # Reject any path traversal attempt
    if Path(filename).name != filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")

    backup_dir = get_backup_dir()
    source = backup_dir / filename
    if not source.exists():
        raise HTTPException(404, "Backup file not found")

    # Safety snapshot of current DB before overwriting
    safety_ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    safety_path = backup_dir / f"pharmacy_pre_restore_{safety_ts}.db"
    _do_backup(safety_path)

    # Close all active SQLAlchemy connections
    engine.dispose()

    # Restore chosen backup → pharmacy.db
    _do_backup_from(source, DB_PATH)

    return {
        "restored_from": filename,
        "safety_snapshot": safety_path.name,
        "message": "Database restored successfully. Refresh the app.",
    }


def _do_backup_from(src_path: Path, dest_path: Path):
    """Copy src_path → dest_path using sqlite3 backup API."""
    src = sqlite3.connect(str(src_path))
    dst = sqlite3.connect(str(dest_path))
    with dst:
        src.backup(dst)
    dst.close()
    src.close()


@router.delete("/{filename}", status_code=204)
def delete_backup(filename: str):
    if Path(filename).name != filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")

    backup_dir = get_backup_dir()
    file_path = backup_dir / filename
    if not file_path.exists():
        raise HTTPException(404, "Backup file not found")

    file_path.unlink()
