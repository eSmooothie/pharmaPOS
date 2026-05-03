import { useState, useEffect } from "react";
import api from "../api";
import Backup from "./Backup";
import { formatDateTime } from "../utils/date";

const DEFAULT_FORM = { business_name: "", address: "", tin: "", contact: "" };

const tabStyle = (active) => ({
  background: "none",
  border: "none",
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  color: active ? "#4f46e5" : "#64748b",
  borderBottom: active ? "2px solid #4f46e5" : "2px solid transparent",
});

// Tabs that require the shared password before rendering
const LOCKED_TABS = ["backup", "changes"];

// ── Shared password gate ──────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  async function submit(e) {
    e.preventDefault();
    try {
      await api.post("/backup/verify-password", { password: pw });
      onUnlock();
    } catch {
      setErr(true);
      setPw("");
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "40px auto", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Password Required</div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        Enter the access password to continue.
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={pw}
          autoFocus
          onChange={e => { setPw(e.target.value); setErr(false); }}
        />
        {err && <div className="alert-error" style={{ textAlign: "left" }}>Incorrect password.</div>}
        <button className="btn btn-primary" type="submit">Unlock</button>
      </form>
    </div>
  );
}

// ── Categories (drug classes + grocery categories) ───────────────────────────
function CategoryManager({ title, fetchUrl, postUrl, placeholder }) {
  const [items, setItems] = useState([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const r = await api.get(fetchUrl);
    setItems(r.data.slice().sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function add(e) {
    e.preventDefault();
    const name = input.trim();
    if (!name) return;
    if (items.some(i => i.name.toLowerCase() === name.toLowerCase())) {
      setError("Already exists.");
      return;
    }
    setAdding(true);
    setError("");
    try {
      await api.post(postUrl, { name });
      setInput("");
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to add.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="card" style={{ flex: 1, minWidth: 220 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{title}</div>

      <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
        {items.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>No items yet.</div>
        ) : (
          items.map(item => (
            <div key={item.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid #f1f5f9", color: "#334155" }}>
              {item.name}
            </div>
          ))
        )}
      </div>

      <form onSubmit={add} style={{ display: "flex", gap: 6 }}>
        <input
          className="input"
          placeholder={placeholder}
          value={input}
          onChange={e => { setInput(e.target.value); setError(""); }}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary btn-sm" type="submit" disabled={adding || !input.trim()}>
          {adding ? "…" : "Add"}
        </button>
      </form>
      {error && <div style={{ fontSize: 12, color: "#dc2626", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function Categories() {
  return (
    <div>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        Add new drug classes or grocery categories. These appear in inventory dropdowns immediately after saving.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <CategoryManager
          title="💊 Drug Classes"
          fetchUrl="/drug-classes"
          postUrl="/drug-classes"
          placeholder="e.g. Anticoagulants"
        />
        <CategoryManager
          title="🧺 Grocery Categories"
          fetchUrl="/grocery-categories"
          postUrl="/grocery-categories"
          placeholder="e.g. Frozen Foods"
        />
      </div>
    </div>
  );
}

// ── Item Changes (audit log) ──────────────────────────────────────────────────
const ACTION_LABELS = {
  sold: "Sold", voided: "Voided", restocked: "Restocked",
  created: "Created", updated: "Updated", deleted: "Deleted", adjusted: "Adjusted",
};

function ItemChanges() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ item_type: "", action: "", date: "" });

  useEffect(() => { load(); }, []);

  async function load(f = filters) {
    setLoading(true);
    try {
      const params = {};
      if (f.item_type) params.item_type = f.item_type;
      if (f.action)    params.action    = f.action;
      if (f.date)      params.date      = f.date;
      const r = await api.get("/audit-log", { params: { ...params, limit: 200 } });
      setLogs(r.data);
    } finally {
      setLoading(false);
    }
  }

  function setFilter(key, val) {
    const next = { ...filters, [key]: val };
    setFilters(next);
    load(next);
  }

  return (
    <div>
      <div className="filters" style={{ marginBottom: 14 }}>
        <select className="select" value={filters.item_type} onChange={e => setFilter("item_type", e.target.value)}>
          <option value="">All types</option>
          <option value="medicine">Medicine</option>
          <option value="grocery">Grocery</option>
        </select>
        <select className="select" value={filters.action} onChange={e => setFilter("action", e.target.value)}>
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <input
          className="input"
          type="date"
          value={filters.date}
          onChange={e => setFilter("date", e.target.value)}
          style={{ width: "auto" }}
        />
        {(filters.item_type || filters.action || filters.date) && (
          <button className="btn btn-outline btn-sm" onClick={() => {
            const cleared = { item_type: "", action: "", date: "" };
            setFilters(cleared);
            load(cleared);
          }}>Clear</button>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Date / Time</th>
              <th>Type</th>
              <th>Item ID</th>
              <th>Action</th>
              <th>Field</th>
              <th>Old Value</th>
              <th>New Value</th>
              <th>Note</th>
            </tr></thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={8}><div className="empty-state">No records found</div></td></tr>
              )}
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(log.changed_at)}</td>
                  <td>
                    <span className={`badge ${log.item_type === "medicine" ? "badge-med" : "badge-groc"}`}>
                      {log.item_type === "medicine" ? "💊 Med" : "🧺 Groc"}
                    </span>
                  </td>
                  <td>{log.item_id}</td>
                  <td>
                    <span style={{
                      fontWeight: 600,
                      color: log.action === "sold" ? "#0284c7"
                           : log.action === "voided" ? "#dc2626"
                           : log.action === "restocked" ? "#059669"
                           : "#475569",
                    }}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td style={{ color: "#64748b" }}>{log.field_name ?? "—"}</td>
                  <td style={{ color: "#94a3b8" }}>{log.old_value ?? "—"}</td>
                  <td>{log.new_value ?? "—"}</td>
                  <td style={{ color: "#64748b", fontSize: 12 }}>{log.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── System Settings tab ───────────────────────────────────────────────────────
const TIMEZONES = [
  { value: "Asia/Manila",       label: "Asia/Manila — Philippines (UTC+8)" },
  { value: "Asia/Singapore",    label: "Asia/Singapore (UTC+8)" },
  { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur — Malaysia (UTC+8)" },
  { value: "Asia/Jakarta",      label: "Asia/Jakarta — WIB Indonesia (UTC+7)" },
  { value: "Asia/Bangkok",      label: "Asia/Bangkok — Thailand (UTC+7)" },
  { value: "Asia/Hong_Kong",    label: "Asia/Hong_Kong (UTC+8)" },
  { value: "Asia/Tokyo",        label: "Asia/Tokyo — Japan (UTC+9)" },
  { value: "Asia/Seoul",        label: "Asia/Seoul — Korea (UTC+9)" },
  { value: "Asia/Dubai",        label: "Asia/Dubai — UAE (UTC+4)" },
  { value: "Asia/Kolkata",      label: "Asia/Kolkata — India (UTC+5:30)" },
  { value: "Asia/Karachi",      label: "Asia/Karachi — Pakistan (UTC+5)" },
  { value: "Australia/Sydney",  label: "Australia/Sydney — AEST (UTC+10/11)" },
  { value: "Pacific/Auckland",  label: "Pacific/Auckland — New Zealand (UTC+12/13)" },
  { value: "Europe/London",     label: "Europe/London — UK (UTC+0/1)" },
  { value: "Europe/Paris",      label: "Europe/Paris — CET (UTC+1/2)" },
  { value: "Europe/Moscow",     label: "Europe/Moscow — MSK (UTC+3)" },
  { value: "Africa/Cairo",      label: "Africa/Cairo — EET (UTC+2)" },
  { value: "America/New_York",  label: "America/New_York — ET (UTC-5/-4)" },
  { value: "America/Chicago",   label: "America/Chicago — CT (UTC-6/-5)" },
  { value: "America/Denver",    label: "America/Denver — MT (UTC-7/-6)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles — PT (UTC-8/-7)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo — BRT (UTC-3/-2)" },
  { value: "UTC",               label: "UTC (UTC+0)" },
];

function SystemSettingsTab() {
  const [timezone, setTimezone] = useState("Asia/Manila");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/system-settings").then(r => {
      setTimezone(r.data.timezone || "Asia/Manila");
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await api.put("/system-settings", { timezone });
      setSuccess(true);
      window.__pharmaPOSTz = timezone;
      window.dispatchEvent(new CustomEvent("systemsettings:updated", { detail: { timezone } }));
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div style={{ maxWidth: 520 }}>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        Controls how dates and times are displayed throughout the app.
      </p>
      {error   && <div className="alert-error"   style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="alert-success" style={{ marginBottom: 14 }}>Saved successfully.</div>}
      <form className="card" onSubmit={save}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="form-field">
            <label className="form-label">Timezone</label>
            <select
              className="select"
              value={timezone}
              onChange={e => { setTimezone(e.target.value); setSuccess(false); }}
              style={{ width: "100%" }}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────
export default function Settings() {
  const [tab, setTab] = useState("business");
  const [unlocked, setUnlocked] = useState({ backup: false, changes: false });

  function handleTabClick(t) {
    setTab(t);
  }

  function unlock(t) {
    setUnlocked(prev => ({ ...prev, [t]: true }));
  }

  // ── Business Info state ───────────────────────────────────────────────────
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/business-info").then(r => {
      const d = r.data;
      setForm({
        business_name: d.business_name ?? "",
        address:       d.address       ?? "",
        tin:           d.tin           ?? "",
        contact:       d.contact       ?? "",
      });
    }).finally(() => setLoadingInfo(false));
  }, []);

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setSuccess(false);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await api.put("/business-info", {
        business_name: form.business_name || null,
        address:       form.address       || null,
        tin:           form.tin           || null,
        contact:       form.contact       || null,
      });
      setSuccess(true);
      window.dispatchEvent(new Event("businessinfo:updated"));
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
        <button style={tabStyle(tab === "business")} onClick={() => handleTabClick("business")}>
          Business Info
        </button>
        <button style={tabStyle(tab === "categories")} onClick={() => handleTabClick("categories")}>
          Categories
        </button>
        <button style={tabStyle(tab === "backup")} onClick={() => handleTabClick("backup")}>
          Backup & Restore
        </button>
        <button style={tabStyle(tab === "changes")} onClick={() => handleTabClick("changes")}>
          Item Changes
        </button>
        <button style={tabStyle(tab === "system")} onClick={() => handleTabClick("system")}>
          System
        </button>
      </div>

      {/* ── Business Info tab ── */}
      {tab === "business" && (
        <div style={{ maxWidth: 520 }}>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
            Displayed on printed receipts. The business name also replaces "PharmaPOS" in the app title.
          </p>

          {error   && <div className="alert-error"   style={{ marginBottom: 14 }}>{error}</div>}
          {success && <div className="alert-success" style={{ marginBottom: 14 }}>Saved successfully.</div>}

          {loadingInfo ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <form className="card" onSubmit={save}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                <div className="form-field">
                  <label className="form-label">Business Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Santos Pharmacy"
                    value={form.business_name}
                    onChange={e => setField("business_name", e.target.value)}
                  />
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    Defaults to "PharmaPOS" when blank.
                  </span>
                </div>

                <div className="form-field">
                  <label className="form-label">Address</label>
                  <textarea
                    className="input"
                    placeholder="e.g. 123 Rizal St., Brgy. Poblacion, Davao City"
                    rows={2}
                    value={form.address}
                    onChange={e => setField("address", e.target.value)}
                    style={{ resize: "vertical" }}
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">TIN (Tax Identification Number)</label>
                  <input
                    className="input"
                    placeholder="e.g. 123-456-789-000"
                    value={form.tin}
                    onChange={e => setField("tin", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Contact</label>
                  <input
                    className="input"
                    placeholder="e.g. (082) 123-4567 / 09XX-XXX-XXXX"
                    value={form.contact}
                    onChange={e => setField("contact", e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Categories tab (no password) ── */}
      {tab === "categories" && <Categories />}

      {/* ── System Settings tab ── */}
      {tab === "system" && <SystemSettingsTab />}

      {/* ── Locked tabs (Backup & Item Changes) ── */}
      {LOCKED_TABS.map(t => tab === t && (
        unlocked[t] ? (
          t === "backup"
            ? <Backup key={t} showHeader={false} />
            : <ItemChanges key={t} />
        ) : (
          <PasswordGate key={t} onUnlock={() => unlock(t)} />
        )
      ))}
    </div>
  );
}
