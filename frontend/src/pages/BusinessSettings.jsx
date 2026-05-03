import { useState, useEffect } from "react";
import api from "../api";

const DEFAULT_FORM = { business_name: "", address: "", tin: "", contact: "" };

export default function BusinessSettings() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
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
    }).finally(() => setLoading(false));
  }, []);

  function set(field, value) {
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
      // Notify App to refresh the topbar title
      window.dispatchEvent(new Event("businessinfo:updated"));
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="page-header">
        <h2>Business Information</h2>
      </div>

      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        This information appears on printed receipts. The business name also replaces
        "PharmaPOS" in the app title.
      </p>

      {error   && <div className="alert-error"   style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="alert-success" style={{ marginBottom: 14 }}>Saved successfully.</div>}

      <form className="card" onSubmit={save}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div className="form-field">
            <label className="form-label">Business Name</label>
            <input
              className="input"
              placeholder="e.g. Santos Pharmacy"
              value={form.business_name}
              onChange={e => set("business_name", e.target.value)}
            />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              Shown as the app title. Defaults to "PharmaPOS" when blank.
            </span>
          </div>

          <div className="form-field">
            <label className="form-label">Address</label>
            <textarea
              className="input"
              placeholder="e.g. 123 Rizal St., Brgy. Poblacion, Davao City"
              rows={2}
              value={form.address}
              onChange={e => set("address", e.target.value)}
              style={{ resize: "vertical" }}
            />
          </div>

          <div className="form-field">
            <label className="form-label">TIN (Tax Identification Number)</label>
            <input
              className="input"
              placeholder="e.g. 123-456-789-000"
              value={form.tin}
              onChange={e => set("tin", e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Contact</label>
            <input
              className="input"
              placeholder="e.g. (082) 123-4567 / 09XX-XXX-XXXX"
              value={form.contact}
              onChange={e => set("contact", e.target.value)}
            />
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
