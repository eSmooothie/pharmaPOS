import { useState, useEffect } from "react";
import api from "../api";
import { getTimezone } from "../utils/date";

const EMPTY_FORM = {
  generic_name: "", brand_name: "", manufacturer: "",
  drug_class_id: "", dosage_form: "", strength: "",
  unit: "tablet", price: "", reorder_level: 10,
  barcode: "", description: "",
};

const DOSAGE_FORMS = ["tablet", "capsule", "syrup", "cream", "injection", "drops", "powder", "other"];

export default function MedicineInventory() {
  const [medicines, setMedicines] = useState([]);
  const [drugClasses, setDrugClasses] = useState([]);
  const [filters, setFilters] = useState({ q: "", drug_class_id: "", dosage_form: "" });
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState(null); // null | "add" | "edit" | "batch" | "batches"
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [batchForm, setBatchForm] = useState({ batch_number: "", expiry_date: "", qty_received: "" });
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadData();
    api.get("/drug-classes").then(r => setDrugClasses(r.data));
  }, []);

  useEffect(() => {
    loadData();
  }, [filters, showArchived]);

  async function loadData() {
    const params = { archived: showArchived };
    if (filters.q) params.q = filters.q;
    if (filters.drug_class_id) params.drug_class_id = filters.drug_class_id;
    if (filters.dosage_form) params.dosage_form = filters.dosage_form;
    const r = await api.get("/medicines", { params });
    setMedicines(r.data);
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setError("");
    setModal("add");
  }

  function openEdit(med) {
    setSelected(med);
    setForm({
      generic_name: med.generic_name, brand_name: med.brand_name,
      manufacturer: med.manufacturer || "", drug_class_id: med.drug_class_id || "",
      dosage_form: med.dosage_form || "", strength: med.strength || "",
      unit: med.unit, price: med.price, reorder_level: med.reorder_level,
      barcode: med.barcode || "", description: med.description || "",
    });
    setError("");
    setModal("edit");
  }

  async function openBatches(med) {
    setSelected(med);
    const r = await api.get(`/medicines/${med.id}/batches`);
    setBatches(r.data);
    setModal("batches");
  }

  function openAddBatch(med) {
    setSelected(med);
    setBatchForm({ batch_number: "", expiry_date: "", qty_received: "" });
    setError("");
    setModal("batch");
  }

  async function saveForm() {
    setError("");
    if (!form.generic_name.trim()) return setError("Generic name is required.");
    if (!form.brand_name.trim()) return setError("Brand name is required.");
    if (!form.unit.trim()) return setError("Unit is required.");
    if (form.price === "" || Number(form.price) < 0) return setError("A valid price is required.");
    const payload = { ...form };
    payload.price = Number(payload.price);
    payload.reorder_level = Number(payload.reorder_level);
    payload.drug_class_id = payload.drug_class_id ? Number(payload.drug_class_id) : null;
    ["manufacturer", "dosage_form", "strength", "barcode", "description"].forEach(k => {
      if (!payload[k]) payload[k] = null;
    });
    try {
      if (modal === "add") {
        await api.post("/medicines", payload);
        setSuccess("Medicine added.");
      } else {
        await api.put(`/medicines/${selected.id}`, payload);
        setSuccess("Medicine updated.");
      }
      setModal(null);
      loadData();
    } catch (e) {
      setError(e.response?.data?.detail || "Save failed");
    }
  }

  async function saveBatch() {
    setError("");
    if (!batchForm.expiry_date) return setError("Expiry date is required.");
    if (!batchForm.qty_received || Number(batchForm.qty_received) <= 0) return setError("Quantity must be greater than 0.");
    try {
      await api.post(`/medicines/${selected.id}/batches`, {
        batch_number: batchForm.batch_number || null,
        expiry_date: batchForm.expiry_date,
        qty_received: Number(batchForm.qty_received),
      });
      setSuccess("Stock batch added.");
      setModal(null);
      loadData();
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to add batch");
    }
  }

  async function archiveMedicine(id, name) {
    if (!window.confirm(`Archive "${name}"? It will be hidden from inventory and sales, but can be restored later.`)) return;
    try {
      await api.delete(`/medicines/${id}`);
      setSuccess("Medicine archived.");
      loadData();
      window.dispatchEvent(new Event("stock:updated"));
    } catch (e) {
      setError(e.response?.data?.detail || "Archive failed");
    }
  }

  async function restoreMedicine(id) {
    try {
      await api.post(`/medicines/${id}/restore`);
      setSuccess("Medicine restored.");
      loadData();
      window.dispatchEvent(new Event("stock:updated"));
    } catch (e) {
      setError(e.response?.data?.detail || "Restore failed");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Medicine Inventory {showArchived && <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>— Archived</span>}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`btn ${showArchived ? "btn-danger" : "btn-outline"} btn-sm`}
            onClick={() => { setShowArchived(v => !v); setFilters({ q: "", drug_class_id: "", dosage_form: "" }); }}
          >
            {showArchived ? "← Active Items" : "View Archived"}
          </button>
          {!showArchived && <button className="btn btn-primary" onClick={openAdd}>+ Add Medicine</button>}
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success" onClick={() => setSuccess("")}>{success}</div>}

      <div className="filters">
        <input className="input" placeholder="Search name, brand, barcode…"
          value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
        <select className="select" value={filters.drug_class_id}
          onChange={e => setFilters(f => ({ ...f, drug_class_id: e.target.value }))}>
          <option value="">All drug classes</option>
          {drugClasses.map(dc => <option key={dc.id} value={dc.id}>{dc.name}</option>)}
        </select>
        <select className="select" value={filters.dosage_form}
          onChange={e => setFilters(f => ({ ...f, dosage_form: e.target.value }))}>
          <option value="">All forms</option>
          {DOSAGE_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Generic Name</th><th>Brand</th><th>Drug Class</th>
              <th>Form / Strength</th><th>Unit</th><th>Price</th>
              <th>Stock</th>
              <th>
                Reorder
                <span className="hint-icon hint-left" data-tip="Alert fires when stock reaches this level">ⓘ</span>
              </th>
              <th></th>
            </tr></thead>
            <tbody>
              {medicines.length === 0 && (
                <tr><td colSpan={9}><div className="empty-state">No medicines found</div></td></tr>
              )}
              {medicines.map(m => (
                <tr key={m.id} style={showArchived ? { opacity: 0.6 } : undefined}>
                  <td><strong>{m.generic_name}</strong></td>
                  <td>{m.brand_name}</td>
                  <td>{m.drug_class_name || "—"}</td>
                  <td style={{ color: "#64748b", fontSize: 12 }}>
                    {[m.dosage_form, m.strength].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td>{m.unit}</td>
                  <td>₱{m.price.toFixed(2)}</td>
                  <td style={{ color: m.stock_qty <= m.reorder_level ? "#ef4444" : undefined, fontWeight: m.stock_qty <= m.reorder_level ? 700 : undefined }}>
                    {m.stock_qty}
                  </td>
                  <td>{m.reorder_level}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {showArchived ? (
                        <button className="btn btn-primary btn-sm" onClick={() => restoreMedicine(m.id)}>Restore</button>
                      ) : (
                        <>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(m)}>Edit</button>
                          <button className="btn btn-primary btn-sm" onClick={() => openAddBatch(m)}>+ Stock</button>
                          <button className="btn btn-outline btn-sm" onClick={() => openBatches(m)}>Batches</button>
                          <button className="btn btn-danger btn-sm" onClick={() => archiveMedicine(m.id, m.generic_name)}>Archive</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit modal */}
      {(modal === "add" || modal === "edit") && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>{modal === "add" ? "Add Medicine" : "Edit Medicine"}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {error && <div className="alert-error">{error}</div>}
            <div className="form-grid">
              {[
                ["generic_name", "Generic Name *", "full"],
                ["brand_name", "Brand Name *"],
                ["manufacturer", "Manufacturer"],
                ["strength", "Strength (e.g. 500mg)"],
                ["barcode", "Barcode (optional)"],
              ].map(([key, label, cls]) => (
                <div key={key} className={`form-field${cls ? " " + cls : ""}`}>
                  <label className="form-label">{label}</label>
                  <input className="input" value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div className="form-field">
                <label className="form-label">Drug Class</label>
                <select className="select" value={form.drug_class_id}
                  onChange={e => setForm(f => ({ ...f, drug_class_id: e.target.value }))}>
                  <option value="">— none —</option>
                  {drugClasses.map(dc => <option key={dc.id} value={dc.id}>{dc.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">
                  Dosage Form
                  <span className="hint-icon" data-tip="Physical form of the medicine (e.g. tablet, syrup, cream)">ⓘ</span>
                </label>
                <select className="select" value={form.dosage_form}
                  onChange={e => setForm(f => ({ ...f, dosage_form: e.target.value }))}>
                  <option value="">— none —</option>
                  {DOSAGE_FORMS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">
                  Unit *
                  <span className="hint-icon" data-tip="How you count and sell it (e.g. tablet, bottle, tube, vial)">ⓘ</span>
                </label>
                <input className="input" value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="form-label">Price (₱) *</label>
                <input className="input" type="number" step="0.01" value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="form-label">
                  Reorder Level
                  <span className="hint-icon" data-tip="Low-stock alert fires when stock reaches this qty">ⓘ</span>
                </label>
                <input className="input" type="number" value={form.reorder_level}
                  onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))} />
              </div>
              <div className="form-field full">
                <label className="form-label">Description</label>
                <input className="input" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveForm}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add batch modal */}
      {modal === "batch" && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Receive Stock — {selected?.generic_name}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {error && <div className="alert-error">{error}</div>}
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Batch Number</label>
                <input className="input" value={batchForm.batch_number}
                  onChange={e => setBatchForm(f => ({ ...f, batch_number: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="form-label">Expiry Date *</label>
                <input className="input" type="date" value={batchForm.expiry_date}
                  onChange={e => setBatchForm(f => ({ ...f, expiry_date: e.target.value }))} />
              </div>
              <div className="form-field full">
                <label className="form-label">Quantity Received *</label>
                <input className="input" type="number" value={batchForm.qty_received}
                  onChange={e => setBatchForm(f => ({ ...f, qty_received: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBatch}>Add Stock</button>
            </div>
          </div>
        </div>
      )}

      {/* View batches modal */}
      {modal === "batches" && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 560 }}>
            <div className="modal-header">
              <h3>Batches — {selected?.generic_name}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <table>
              <thead><tr>
                <th>Batch #</th><th>Expiry</th><th>Received</th><th>Remaining</th>
              </tr></thead>
              <tbody>
                {batches.length === 0 && (
                  <tr><td colSpan={4}><div className="empty-state">No batches</div></td></tr>
                )}
                {batches.map(b => (
                  <tr key={b.id}>
                    <td>{b.batch_number || "—"}</td>
                    <td style={{ color: b.expiry_date && b.expiry_date < new Date().toLocaleDateString("en-CA", { timeZone: getTimezone() }) ? "#ef4444" : undefined }}>
                      {b.expiry_date || "—"}
                    </td>
                    <td>{b.qty_received}</td>
                    <td>{b.qty_remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
