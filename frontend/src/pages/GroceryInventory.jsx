import { useState, useEffect } from "react";
import api from "../api";

const EMPTY_FORM = {
  name: "", brand: "", category_id: "", unit: "piece",
  price: "", reorder_level: 5, barcode: "", description: "",
};

export default function GroceryInventory() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ q: "", category_id: "" });
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [restockQty, setRestockQty] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadData();
    api.get("/grocery-categories").then(r => setCategories(r.data));
  }, []);

  useEffect(() => { loadData(); }, [filters, showArchived]);

  async function loadData() {
    const params = { archived: showArchived };
    if (filters.q) params.q = filters.q;
    if (filters.category_id) params.category_id = filters.category_id;
    const r = await api.get("/grocery-items", { params });
    setItems(r.data);
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setError("");
    setModal("add");
  }

  function openEdit(item) {
    setSelected(item);
    setForm({
      name: item.name, brand: item.brand || "",
      category_id: item.category_id || "", unit: item.unit,
      price: item.price, reorder_level: item.reorder_level,
      barcode: item.barcode || "", description: item.description || "",
    });
    setError("");
    setModal("edit");
  }

  function openRestock(item) {
    setSelected(item);
    setRestockQty("");
    setError("");
    setModal("restock");
  }

  async function saveForm() {
    setError("");
    if (!form.name.trim()) return setError("Name is required.");
    if (!form.unit.trim()) return setError("Unit is required.");
    if (form.price === "" || Number(form.price) < 0) return setError("A valid price is required.");
    const payload = { ...form };
    payload.price = Number(payload.price);
    payload.reorder_level = Number(payload.reorder_level);
    payload.category_id = payload.category_id ? Number(payload.category_id) : null;
    ["brand", "barcode", "description"].forEach(k => { if (!payload[k]) payload[k] = null; });
    try {
      if (modal === "add") {
        await api.post("/grocery-items", payload);
        setSuccess("Item added.");
      } else {
        await api.put(`/grocery-items/${selected.id}`, payload);
        setSuccess("Item updated.");
      }
      setModal(null);
      loadData();
    } catch (e) {
      setError(e.response?.data?.detail || "Save failed");
    }
  }

  async function saveRestock() {
    setError("");
    if (!restockQty || Number(restockQty) <= 0) return setError("Quantity must be greater than 0.");
    try {
      await api.post(`/grocery-items/${selected.id}/restock`, { qty: Number(restockQty) });
      setSuccess(`Added ${restockQty} units to ${selected.name}.`);
      setModal(null);
      loadData();
    } catch (e) {
      setError(e.response?.data?.detail || "Restock failed");
    }
  }

  async function archiveItem(id, name) {
    if (!window.confirm(`Archive "${name}"? It will be hidden from inventory and sales, but can be restored later.`)) return;
    try {
      await api.delete(`/grocery-items/${id}`);
      setSuccess("Item archived.");
      loadData();
      window.dispatchEvent(new Event("stock:updated"));
    } catch (e) {
      setError(e.response?.data?.detail || "Archive failed");
    }
  }

  async function restoreItem(id) {
    try {
      await api.post(`/grocery-items/${id}/restore`);
      setSuccess("Item restored.");
      loadData();
      window.dispatchEvent(new Event("stock:updated"));
    } catch (e) {
      setError(e.response?.data?.detail || "Restore failed");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Grocery Inventory {showArchived && <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>— Archived</span>}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`btn ${showArchived ? "btn-danger" : "btn-outline"} btn-sm`}
            onClick={() => { setShowArchived(v => !v); setFilters({ q: "", category_id: "" }); }}
          >
            {showArchived ? "← Active Items" : "View Archived"}
          </button>
          {!showArchived && <button className="btn btn-primary" onClick={openAdd}>+ Add Item</button>}
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success" onClick={() => setSuccess("")}>{success}</div>}

      <div className="filters">
        <input className="input" placeholder="Search name, brand, barcode…"
          value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
        <select className="select" value={filters.category_id}
          onChange={e => setFilters(f => ({ ...f, category_id: e.target.value }))}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Name</th><th>Brand</th><th>Category</th>
              <th>Unit</th><th>Price</th><th>Stock</th>
              <th>
                Reorder
                <span className="hint-icon hint-left" data-tip="Alert fires when stock reaches this level">ⓘ</span>
              </th>
              <th></th>
            </tr></thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={8}><div className="empty-state">No items found</div></td></tr>
              )}
              {items.map(item => (
                <tr key={item.id} style={showArchived ? { opacity: 0.6 } : undefined}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.brand || "—"}</td>
                  <td>{item.category_name || "—"}</td>
                  <td>{item.unit}</td>
                  <td>₱{item.price.toFixed(2)}</td>
                  <td style={{ color: item.stock_qty <= item.reorder_level ? "#ef4444" : undefined, fontWeight: item.stock_qty <= item.reorder_level ? 700 : undefined }}>
                    {item.stock_qty}
                  </td>
                  <td>{item.reorder_level}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {showArchived ? (
                        <button className="btn btn-primary btn-sm" onClick={() => restoreItem(item.id)}>Restore</button>
                      ) : (
                        <>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>Edit</button>
                          <button className="btn btn-primary btn-sm" onClick={() => openRestock(item)}>+ Stock</button>
                          <button className="btn btn-danger btn-sm" onClick={() => archiveItem(item.id, item.name)}>Archive</button>
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
              <h3>{modal === "add" ? "Add Grocery Item" : "Edit Item"}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {error && <div className="alert-error">{error}</div>}
            <div className="form-grid">
              <div className="form-field full">
                <label className="form-label">Name *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="form-label">Brand</label>
                <input className="input" value={form.brand}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
              </div>
              <div className="form-field">
                <label className="form-label">Category</label>
                <select className="select" value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                  <option value="">— none —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Unit *</label>
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
              <div className="form-field">
                <label className="form-label">Barcode (optional)</label>
                <input className="input" value={form.barcode}
                  onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
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

      {/* Restock modal */}
      {modal === "restock" && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 360 }}>
            <div className="modal-header">
              <h3>Restock — {selected?.name}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              Current stock: <strong>{selected?.stock_qty}</strong> {selected?.unit}
            </p>
            {error && <div className="alert-error">{error}</div>}
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label className="form-label">Quantity to Add *</label>
              <input className="input" type="number" value={restockQty}
                onChange={e => setRestockQty(e.target.value)} autoFocus />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveRestock}>Add Stock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
