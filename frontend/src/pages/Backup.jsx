import { useState, useEffect } from "react";
import api from "../api";
import { formatDateTime } from "../utils/date";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Backup({ showHeader = true }) {
  const [config, setConfig] = useState(null);
  const [backups, setBackups] = useState([]);
  const [configForm, setConfigForm] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [restoreModal, setRestoreModal] = useState(null); // filename string

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [cfgRes, listRes] = await Promise.all([
      api.get("/backup/config"),
      api.get("/backup/list"),
    ]);
    setConfig(cfgRes.data);
    setConfigForm({ ...cfgRes.data });
    setBackups(listRes.data);
  }

  async function saveConfig() {
    setError("");
    try {
      const res = await api.put("/backup/config", {
        enabled: configForm.enabled,
        interval_hours: Number(configForm.interval_hours),
        retention_count: Number(configForm.retention_count),
      });
      setConfig(res.data);
      setConfigForm({ ...res.data });
      setSuccess("Settings saved.");
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to save settings");
    }
  }

  async function backupNow() {
    setLoadingBackup(true);
    setError("");
    try {
      const res = await api.post("/backup/now");
      setSuccess(`Backup created: ${res.data.filename} (${formatSize(res.data.size)})`);
      const listRes = await api.get("/backup/list");
      setBackups(listRes.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Backup failed");
    } finally {
      setLoadingBackup(false);
    }
  }

  async function confirmRestore() {
    setError("");
    try {
      const res = await api.post(`/backup/restore/${restoreModal}`);
      setSuccess(`Restored from ${res.data.restored_from}. Safety snapshot: ${res.data.safety_snapshot}`);
      setRestoreModal(null);
      const listRes = await api.get("/backup/list");
      setBackups(listRes.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Restore failed");
      setRestoreModal(null);
    }
  }

  async function deleteBackup(filename) {
    if (!window.confirm(`Delete ${filename}?`)) return;
    setError("");
    try {
      await api.delete(`/backup/${filename}`);
      setBackups(prev => prev.filter(b => b.filename !== filename));
      setSuccess(`Deleted ${filename}`);
    } catch (e) {
      setError(e.response?.data?.detail || "Delete failed");
    }
  }

  if (!configForm) return <div className="empty-state">Loading…</div>;

  const regularBackups = backups.filter(b => !b.is_pre_restore);
  const safetySnapshots = backups.filter(b => b.is_pre_restore);

  return (
    <div>
      {showHeader && (
        <div className="page-header">
          <h2>Database Backup</h2>
          <button className="btn btn-outline btn-sm" onClick={loadAll}>Refresh</button>
        </div>
      )}

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div className="alert-success" onClick={() => setSuccess("")} style={{ cursor: "pointer" }}>
          {success} <span style={{ float: "right", opacity: 0.6 }}>✕</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>

        {/* Settings */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Automatic Backup Settings</div>

          <div className="form-field" style={{ marginBottom: 14 }}>
            <label className="form-label">Enable automatic backups</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <button
                className={`btn btn-sm ${configForm.enabled ? "btn-success" : "btn-outline"}`}
                onClick={() => setConfigForm(f => ({ ...f, enabled: true }))}
              >On</button>
              <button
                className={`btn btn-sm ${!configForm.enabled ? "btn-danger" : "btn-outline"}`}
                onClick={() => setConfigForm(f => ({ ...f, enabled: false }))}
              >Off</button>
              <span style={{ fontSize: 12, color: configForm.enabled ? "#059669" : "#ef4444" }}>
                {configForm.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>

          <div className="form-field" style={{ marginBottom: 14 }}>
            <label className="form-label">
              Backup interval (hours)
              <span className="hint-icon" data-tip="A backup runs on startup if this many hours have passed since the last one">ⓘ</span>
            </label>
            <input
              className="input"
              type="number"
              min="1"
              value={configForm.interval_hours}
              onChange={e => setConfigForm(f => ({ ...f, interval_hours: e.target.value }))}
            />
          </div>

          <div className="form-field" style={{ marginBottom: 16 }}>
            <label className="form-label">
              Backups to keep
              <span className="hint-icon" data-tip="Oldest backups are deleted automatically once this limit is exceeded">ⓘ</span>
            </label>
            <input
              className="input"
              type="number"
              min="1"
              value={configForm.retention_count}
              onChange={e => setConfigForm(f => ({ ...f, retention_count: e.target.value }))}
            />
          </div>

          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={saveConfig}>
            Save Settings
          </button>
        </div>

        {/* Manual backup */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Manual Backup</div>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
            Create an immediate backup of the current database state regardless of the schedule.
          </p>

          <div style={{ marginTop: "auto" }}>
            {regularBackups.length > 0 && (
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                <span style={{ fontWeight: 600 }}>Last backup:</span>{" "}
                {formatDateTime(regularBackups[0].created_at)}{" "}
                <span style={{ color: "#94a3b8" }}>({formatSize(regularBackups[0].size)})</span>
              </div>
            )}
            <button
              className="btn btn-success"
              style={{ width: "100%", justifyContent: "center", padding: 10 }}
              disabled={loadingBackup}
              onClick={backupNow}
            >
              {loadingBackup ? "Backing up…" : "🗄️ Backup Now"}
            </button>
          </div>
        </div>
      </div>

      {/* Backup history */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "14px 16px 10px", fontWeight: 700, fontSize: 15, borderBottom: "1px solid #f1f5f9" }}>
          Backup History
          <span style={{ fontWeight: 400, fontSize: 12, color: "#94a3b8", marginLeft: 8 }}>
            {regularBackups.length} backup{regularBackups.length !== 1 ? "s" : ""}
            {safetySnapshots.length > 0 && ` · ${safetySnapshots.length} pre-restore snapshot${safetySnapshots.length !== 1 ? "s" : ""}`}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Size</th>
                <th>Created</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state">No backups yet</div></td></tr>
              )}
              {backups.map(b => (
                <tr key={b.filename}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{b.filename}</td>
                  <td>{formatSize(b.size)}</td>
                  <td>{formatDateTime(b.created_at)}</td>
                  <td>
                    {b.is_pre_restore
                      ? <span className="badge badge-warn">pre-restore</span>
                      : <span className="badge badge-med">backup</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!b.is_pre_restore && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setRestoreModal(b.filename)}
                        >
                          Restore
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteBackup(b.filename)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore confirmation modal */}
      {restoreModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-header">
              <h3>Restore Database</h3>
              <button className="modal-close" onClick={() => setRestoreModal(null)}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
              You are about to restore from:
            </p>
            <div style={{ background: "#f8fafc", borderRadius: 6, padding: "8px 12px", fontFamily: "monospace", fontSize: 12, marginBottom: 14 }}>
              {restoreModal}
            </div>
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "10px 12px", fontSize: 12, color: "#92400e", marginBottom: 16 }}>
              ⚠️ This will replace the <strong>current database</strong>. A safety snapshot of the current state will be taken automatically before restoring.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setRestoreModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmRestore}>Restore</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
