# Database Backup — Design Spec

**Date:** 2026-05-03
**Status:** Approved

---

## Overview

A backup feature for the pharmacy POS system that protects the single SQLite database (`pharmacy.db`) from data loss. Supports both scheduled automatic backups and on-demand manual backups, with a UI for managing backup history and restoring from any saved snapshot.

---

## Approach

**SQLite Online Backup API + APScheduler.** Python's built-in `sqlite3.backup()` produces a consistent, crash-safe snapshot even while the database has active writes. APScheduler runs inside the FastAPI process, so no external cron jobs or OS-level task scheduling is required. Settings are persisted in a plain JSON config file.

---

## Configuration

**File:** `backend/backup_config.json`

```json
{
  "enabled": true,
  "interval_hours": 24,
  "retention_count": 14,
  "backup_dir": "../backups"
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Whether automatic backups are active |
| `interval_hours` | integer | `24` | How often the scheduler runs a backup |
| `retention_count` | integer | `14` | Max backup files to keep (oldest deleted first) |
| `backup_dir` | string | `"../backups"` | Path to backup folder, relative to `backend/` |

Changing settings via `PUT /backup/config` takes effect immediately — no server restart needed.

---

## Backup Naming & Storage

- **Folder:** `pos_system/backups/` (created automatically if missing)
- **Filename format:** `pharmacy_YYYY-MM-DD_HH-MM-SS.db`
- **Pre-restore safety snapshot:** `pharmacy_pre_restore_YYYY-MM-DD_HH-MM-SS.db`

---

## API Endpoints

All endpoints are prefixed with `/backup`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/backup/config` | Read current backup settings |
| `PUT` | `/backup/config` | Update settings; reschedules job immediately |
| `POST` | `/backup/now` | Trigger a manual backup immediately |
| `GET` | `/backup/list` | List all backup files (name, size, created timestamp) |
| `POST` | `/backup/restore/{filename}` | Restore DB from a named backup file |
| `DELETE` | `/backup/{filename}` | Delete a specific backup file |

---

## Backup Logic

1. Create `backups/` folder if it doesn't exist.
2. Generate filename: `pharmacy_YYYY-MM-DD_HH-MM-SS.db`.
3. Run `sqlite3.backup(dest_connection)` — produces a consistent hot copy.
4. Count files in `backups/`. If count exceeds `retention_count`, delete the oldest files.
5. Return filename, size in bytes, and timestamp to the caller.

Retention applies after every backup — both scheduled and manual. Pre-restore safety snapshots (`pharmacy_pre_restore_*.db`) are excluded from the retention count so they never displace regular backups.

---

## Restore Logic

1. Validate the requested filename exists inside `backups/` (reject any path traversal attempts — filename must not contain `/`, `\`, or `..`).
2. Take a safety snapshot → `backups/pharmacy_pre_restore_TIMESTAMP.db` using `sqlite3.backup()`.
3. Dispose the SQLAlchemy engine connection pool to close all active DB connections.
4. Overwrite `pharmacy.db` with the chosen backup file using `sqlite3.backup()`.
5. Reinitialise the SQLAlchemy engine so the app reconnects immediately.

**On failure:** the safety snapshot exists in `backups/` and can be restored manually or via the UI.

---

## Scheduler Lifecycle

The system does not run 24 hours — staff shut the device down daily. A fixed-interval scheduler would miss backups entirely if the app is not running at the scheduled time. The solution is a **startup check + interval-from-last-backup** approach.

**On every startup:**
1. Read `backup_config.json`. If `enabled: false`, skip.
2. Find the most recent regular backup file in `backups/` and read its timestamp from the filename.
3. If no backup exists yet, or if `now − last_backup_time ≥ interval_hours`, trigger an immediate backup before the scheduler starts.
4. Start APScheduler with an hourly polling job (every 60 minutes) that re-checks the same condition: `now − last_backup_time ≥ interval_hours`. If true, run a backup. This covers the case where the app stays open across the threshold (e.g. opened at 9 AM, still running 24 hours later).

**Effect:** the app effectively backs up once per day on first open, regardless of what time staff start it.

**Config changes:** `PUT /backup/config` with a new `interval_hours` restarts the polling job in-place — no server restart required.

**Shutdown:** APScheduler shuts down cleanly on FastAPI shutdown. No backup is triggered on shutdown.

**Error handling:** if a backup fails (e.g. disk full), the error is logged and the server continues running. Staff will notice the missing entry in the backup history list.

---

## New Files

```
pos_system/
├── backend/
│   ├── backup_config.json       # Persisted backup settings
│   ├── routers/
│   │   └── backup.py            # All /backup endpoints + scheduler init
├── backups/                     # Backup files (auto-created)
└── frontend/
    └── src/
        └── pages/
            └── Backup.jsx       # Backup settings + history + restore UI
```

`backup.py` owns both the router and the APScheduler instance. `main.py` imports and starts the scheduler via the lifespan hook.

---

## Frontend UI

**Sidebar entry:** 🗄️ Backup — placed below Reports.

**Three sections on the Backup page:**

### 1. Settings Panel
- Toggle: Enable / disable automatic backups
- Input: Interval in hours (e.g. `24`)
- Input: Backups to keep (e.g. `14`)
- "Save Settings" button — calls `PUT /backup/config`, takes effect immediately

### 2. Manual Backup
- "Backup Now" button — calls `POST /backup/now`
- Displays last backup filename and size on success

### 3. Backup History Table

| Column | Description |
|---|---|
| Filename | e.g. `pharmacy_2026-05-03_14-30-00.db` |
| Size | Human-readable, e.g. `48 KB` |
| Created | Formatted date/time |
| Actions | Restore button, Delete button |

- Sorted newest-first.
- Pre-restore safety snapshots shown with a `[pre-restore]` label.
- **Restore** opens a confirmation modal: *"This will replace the current database. A safety snapshot will be taken automatically before restoring."*
- **Delete** prompts a simple confirmation before removing the file.

---

## Dependencies

| Package | Purpose |
|---|---|
| `apscheduler` | In-process job scheduling for automatic backups |

Add to `backend/requirements.txt`.
