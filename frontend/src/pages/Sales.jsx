import { useState, useEffect, useRef } from "react";
import api from "../api";
import { formatDateTime, formatTime } from "../utils/date";

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Sales() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [selectedDiscount, setSelectedDiscount] = useState(""); // preset discount type id
  const [customDiscountPct, setCustomDiscountPct] = useState(""); // custom % string
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentApp, setPaymentApp] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [note, setNote] = useState("");
  const [completedSale, setCompletedSale] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [businessInfo, setBusinessInfo] = useState(null);

  // Void sale modal
  const [voidModal, setVoidModal] = useState(null); // { saleId, reason }
  const [salesHistory, setSalesHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // View + print
  const [viewSale, setViewSale] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);

  function handlePrint(sale) {
    setPrintTarget(sale);
    setTimeout(() => {
      window.print();
      setPrintTarget(null);
    }, 80);
  }

  function formatPayment(sale) {
    if (sale.payment_method === "online") {
      const parts = ["Online"];
      if (sale.payment_app) parts.push(sale.payment_app);
      if (sale.payment_ref) parts.push(`Ref: ${sale.payment_ref}`);
      return parts.join(" · ");
    }
    return "Cash";
  }

  const debouncedQuery = useDebounce(query);
  const searchRef = useRef();

  useEffect(() => {
    api.get("/discount-types").then(r => setDiscounts(r.data));
    api.get("/sales", { params: { limit: 20 } }).then(r => setSalesHistory(r.data));
    api.get("/business-info").then(r => setBusinessInfo(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!debouncedQuery.trim()) { setResults([]); return; }
    api.get("/search", { params: { q: debouncedQuery } }).then(r => setResults(r.data));
  }, [debouncedQuery]);

  function addToCart(item) {
    setCart(prev => {
      const key = `${item.type}-${item.id}`;
      const existing = prev.find(c => c.key === key);
      if (existing) {
        return prev.map(c => c.key === key ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { key, ...item, qty: 1 }];
    });
    setQuery("");
    setResults([]);
    searchRef.current?.focus();
  }

  function updateQty(key, qty) {
    if (qty < 1) { removeFromCart(key); return; }
    setCart(prev => prev.map(c => c.key === key ? { ...c, qty } : c));
  }

  function removeFromCart(key) {
    setCart(prev => prev.filter(c => c.key !== key));
  }

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  function computeDiscount() {
    if (selectedDiscount) {
      const dt = discounts.find(d => d.id === Number(selectedDiscount));
      if (!dt) return 0;
      const base = dt.is_vat_exempt ? subtotal / 1.12 : subtotal;
      return base * (dt.percent / 100);
    }
    const pct = parseFloat(customDiscountPct);
    if (!isNaN(pct) && pct > 0) return subtotal * (pct / 100);
    return 0;
  }

  const discountAmount = computeDiscount();
  const total = subtotal - discountAmount;

  async function completeSale() {
    if (cart.length === 0) return;
    if (paymentMethod === "online" && !paymentApp.trim()) {
      setError("Please enter the payment app (e.g. GCash, Maya)");
      return;
    }
    if (paymentMethod === "online" && !paymentRef.trim()) {
      setError("Please enter the reference / transaction number");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const items = cart.map(c => ({
        medicine_id: c.type === "medicine" ? c.id : null,
        grocery_item_id: c.type === "grocery" ? c.id : null,
        quantity: c.qty,
      }));
      const customPct = parseFloat(customDiscountPct);
      const r = await api.post("/sales", {
        items,
        discount_type_id: selectedDiscount ? Number(selectedDiscount) : null,
        custom_discount_percent: (!selectedDiscount && !isNaN(customPct) && customPct > 0) ? customPct : null,
        payment_method: paymentMethod,
        payment_app: paymentMethod === "online" ? (paymentApp.trim() || null) : null,
        payment_ref: paymentMethod === "online" ? (paymentRef.trim() || null) : null,
        note: note || null,
      });
      setCompletedSale(r.data);
      setCart([]);
      setSelectedDiscount("");
      setCustomDiscountPct("");
      setPaymentMethod("cash");
      setPaymentApp("");
      setPaymentRef("");
      setNote("");
      window.dispatchEvent(new Event("stock:updated"));
      // refresh history
      const hist = await api.get("/sales", { params: { limit: 20 } });
      setSalesHistory(hist.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to complete sale");
    } finally {
      setLoading(false);
    }
  }

  async function voidSale() {
    try {
      await api.post(`/sales/${voidModal.saleId}/void`, { reason: voidModal.reason || null });
      setVoidModal(null);
      const hist = await api.get("/sales", { params: { limit: 20 } });
      setSalesHistory(hist.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to void sale");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Sales</h2>
        <button className="btn btn-outline btn-sm" onClick={() => setShowHistory(v => !v)}>
          {showHistory ? "New Sale" : "Recent Sales"}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {completedSale && !showHistory && (
        <div className="card" style={{ marginBottom: 20, background: "#f0fdf4", borderColor: "#6ee7b7" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <strong>Sale #{completedSale.id} Complete</strong>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-outline btn-sm" onClick={() => handlePrint(completedSale)}>🖨 Print</button>
              <button className="btn btn-outline btn-sm" onClick={() => setCompletedSale(null)}>Dismiss</button>
            </div>
          </div>
          {completedSale.items.map(si => (
            <div key={si.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
              <span>{si.item_name} × {si.quantity}</span>
              <span>₱{si.subtotal.toFixed(2)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #d1fae5", marginTop: 8, paddingTop: 8 }}>
            {completedSale.discount_amount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#059669" }}>
                <span>
                  Discount ({completedSale.discount_type_name
                    ? completedSale.discount_type_name
                    : `Custom ${completedSale.custom_discount_percent}%`})
                </span>
                <span>−₱{completedSale.discount_amount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 4 }}>
              <span>TOTAL</span>
              <span>₱{completedSale.total_amount.toFixed(2)}</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              {formatPayment(completedSale)} · {formatTime(completedSale.created_at)}
            </div>
          </div>
        </div>
      )}

      {showHistory ? (
        <div className="card">
          <h3 style={{ marginBottom: 14, fontSize: 15 }}>Recent Sales</h3>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>#</th><th>Time</th><th>Items</th><th>Discount</th>
                <th>Total</th><th>Payment</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {salesHistory.map(s => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{formatDateTime(s.created_at)}</td>
                    <td>{s.items.length}</td>
                    <td>
                      {s.discount_amount > 0
                        ? `−₱${s.discount_amount.toFixed(2)} (${s.discount_type_name ?? `Custom ${s.custom_discount_percent}%`})`
                        : "—"}
                    </td>
                    <td>₱{s.total_amount.toFixed(2)}</td>
                    <td>{formatPayment(s)}</td>
                    <td>{s.is_void ? <span className="badge badge-void">VOID</span> : <span className="badge badge-med">OK</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setViewSale(s)}>View</button>
                        {!s.is_void && (
                          <button className="btn btn-danger btn-sm"
                            onClick={() => setVoidModal({ saleId: s.id, reason: "" })}>
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Left: search + results */}
          <div style={{ flex: "1.4" }}>
            <div className="search-wrap" style={{ marginBottom: 10 }}>
              <span className="search-icon">🔍</span>
              <input
                ref={searchRef}
                className="input"
                placeholder="Search by name, brand, or barcode…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>

            {results.length > 0 && (
              <div className="card" style={{ padding: 0, marginBottom: 12 }}>
                <table>
                  <thead><tr>
                    <th>Item</th><th>Type</th><th>Info</th><th>Price</th><th>Stock</th><th></th>
                  </tr></thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={`${r.type}-${r.id}`}>
                        <td>
                          <strong>{r.name}</strong>
                          {r.brand && <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.brand}</div>}
                        </td>
                        <td>
                          <span className={`badge ${r.type === "medicine" ? "badge-med" : "badge-groc"}`}>
                            {r.type === "medicine" ? "💊 Med" : "🧺 Groc"}
                          </span>
                        </td>
                        <td style={{ color: "#64748b", fontSize: 12 }}>{r.extra || r.unit}</td>
                        <td>₱{r.price.toFixed(2)}</td>
                        <td style={{ color: r.stock_qty <= 5 ? "#ef4444" : undefined }}>{r.stock_qty}</td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={r.stock_qty === 0}
                            onClick={() => addToCart(r)}
                          >+ Add</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {query && results.length === 0 && (
              <div className="empty-state">No items found for "{query}"</div>
            )}
          </div>

          {/* Right: cart */}
          <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 260 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Cart</div>

            {cart.length === 0 ? (
              <div className="empty-state" style={{ padding: "20px 0" }}>Cart is empty</div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {cart.map(c => (
                  <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ flex: 1, fontSize: 12 }}>
                      <div>{c.name}</div>
                      <div style={{ color: "#94a3b8", fontSize: 11 }}>{c.type === "medicine" ? "💊" : "🧺"} ₱{c.price.toFixed(2)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => updateQty(c.key, c.qty - 1)}>−</button>
                      <span style={{ minWidth: 24, textAlign: "center" }}>{c.qty}</span>
                      <button className="btn btn-outline btn-sm" onClick={() => updateQty(c.key, c.qty + 1)}>+</button>
                    </div>
                    <span style={{ minWidth: 56, textAlign: "right", fontWeight: 600 }}>₱{(c.price * c.qty).toFixed(2)}</span>
                    <button onClick={() => removeFromCart(c.key)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: "auto" }}>
              <div style={{ marginBottom: 8 }}>
                <label className="form-label" style={{ marginBottom: 6, display: "block" }}>Discount</label>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  {discounts.map(d => (
                    <button
                      key={d.id}
                      className={`btn btn-sm ${selectedDiscount === String(d.id) ? "btn-primary" : "btn-outline"}`}
                      style={{ flex: 1, fontSize: 11 }}
                      onClick={() => {
                        setSelectedDiscount(prev => prev === String(d.id) ? "" : String(d.id));
                        setCustomDiscountPct("");
                      }}
                    >
                      {d.name}<br />
                      <span style={{ opacity: 0.8 }}>{d.percent}%, VAT-exempt</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    className="input"
                    placeholder="Custom %"
                    min="0"
                    max="100"
                    step="0.5"
                    value={customDiscountPct}
                    onChange={e => {
                      setCustomDiscountPct(e.target.value);
                      setSelectedDiscount("");
                    }}
                    style={{ width: "100%" }}
                  />
                  {customDiscountPct && (
                    <button className="btn btn-outline btn-sm" onClick={() => setCustomDiscountPct("")} title="Clear">✕</button>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 10, borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 2 }}>
                  <span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#059669", marginBottom: 2 }}>
                    <span>Discount</span><span>−₱{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}>
                  <span>TOTAL</span><span>₱{total.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <button
                    className={`btn btn-sm ${paymentMethod === "cash" ? "btn-success" : "btn-outline"}`}
                    style={{ flex: 1 }}
                    onClick={() => { setPaymentMethod("cash"); setPaymentApp(""); setPaymentRef(""); }}
                  >💵 Cash</button>
                  <button
                    className={`btn btn-sm ${paymentMethod === "online" ? "btn-success" : "btn-outline"}`}
                    style={{ flex: 1 }}
                    onClick={() => setPaymentMethod("online")}
                  >📱 Online Payment</button>
                </div>
                {paymentMethod === "online" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <input
                      className="input"
                      placeholder="App (e.g. GCash, Maya, BDO) *"
                      value={paymentApp}
                      onChange={e => setPaymentApp(e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="Reference / Transaction No. *"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <input
                className="input"
                placeholder="Note (optional)"
                value={note}
                onChange={e => setNote(e.target.value)}
                style={{ marginBottom: 8 }}
              />

              <button
                className="btn btn-success"
                style={{ width: "100%", justifyContent: "center", padding: 10 }}
                disabled={cart.length === 0 || loading}
                onClick={completeSale}
              >
                {loading ? "Processing…" : "Complete Sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale detail modal */}
      {viewSale && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 540 }}>
            <div className="modal-header">
              <h3>Sale #{viewSale.id}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => handlePrint(viewSale)}>🖨 Print / PDF</button>
                <button className="modal-close" onClick={() => setViewSale(null)}>✕</button>
              </div>
            </div>

            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12, display: "flex", gap: 12 }}>
              <span>{formatDateTime(viewSale.created_at)}</span>
              <span>·</span>
              <span>{formatPayment(viewSale)}</span>
              {viewSale.is_void && <span className="badge badge-void" style={{ marginLeft: 4 }}>VOID</span>}
            </div>

            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table>
                <thead><tr>
                  <th>Item</th>
                  <th style={{ textAlign: "center" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Unit Price</th>
                  <th style={{ textAlign: "right" }}>Subtotal</th>
                </tr></thead>
                <tbody>
                  {viewSale.items.map(si => (
                    <tr key={si.id}>
                      <td>{si.item_name}</td>
                      <td style={{ textAlign: "center" }}>{si.quantity}</td>
                      <td style={{ textAlign: "right" }}>₱{si.unit_price.toFixed(2)}</td>
                      <td style={{ textAlign: "right" }}>₱{si.subtotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                <span>Subtotal</span><span>₱{viewSale.subtotal.toFixed(2)}</span>
              </div>
              {viewSale.discount_amount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#059669", marginBottom: 4 }}>
                  <span>Discount ({viewSale.discount_type_name ?? `Custom ${viewSale.custom_discount_percent}%`})</span>
                  <span>−₱{viewSale.discount_amount.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}>
                <span>TOTAL</span><span>₱{viewSale.total_amount.toFixed(2)}</span>
              </div>
            </div>

            {viewSale.note && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>Note: {viewSale.note}</div>
            )}
            {viewSale.is_void && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef2f2", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
                Voided: {viewSale.void_reason || "No reason given"} · {formatDateTime(viewSale.voided_at)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Void modal */}
      {voidModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Void Sale #{voidModal.saleId}</h3>
              <button className="modal-close" onClick={() => setVoidModal(null)}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              This will restore stock for all items. This action cannot be undone.
            </p>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label className="form-label">Reason (optional)</label>
              <input
                className="input"
                placeholder="Reason for voiding…"
                value={voidModal.reason}
                onChange={e => setVoidModal(v => ({ ...v, reason: e.target.value }))}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline" onClick={() => setVoidModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={voidSale}>Void Sale</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden receipt — only rendered/visible during window.print() */}
      {printTarget && (
        <div className="print-receipt">
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: 1 }}>
              {businessInfo?.business_name || "PharmaPOS"}
            </div>
            {businessInfo?.address && (
              <div style={{ fontSize: 11, marginTop: 2, whiteSpace: "pre-line" }}>{businessInfo.address}</div>
            )}
            {businessInfo?.contact && (
              <div style={{ fontSize: 11 }}>Tel: {businessInfo.contact}</div>
            )}
            {businessInfo?.tin && (
              <div style={{ fontSize: 11 }}>TIN: {businessInfo.tin}</div>
            )}
            <div style={{ fontSize: 12, marginTop: 4 }}>Official Receipt</div>
          </div>

          <div style={{ borderTop: "1px dashed #000", borderBottom: "1px dashed #000", padding: "8px 0", marginBottom: 14, fontSize: 12 }}>
            <div><strong>Sale #:</strong> {printTarget.id}</div>
            <div><strong>Date:</strong> {formatDateTime(printTarget.created_at)}</div>
            <div><strong>Payment:</strong> {formatPayment(printTarget)}</div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #000" }}>
                <th style={{ textAlign: "left", paddingBottom: 4 }}>Item</th>
                <th style={{ textAlign: "center", paddingBottom: 4 }}>Qty</th>
                <th style={{ textAlign: "right", paddingBottom: 4 }}>Price</th>
                <th style={{ textAlign: "right", paddingBottom: 4 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {printTarget.items.map(si => (
                <tr key={si.id}>
                  <td style={{ padding: "4px 0" }}>{si.item_name}</td>
                  <td style={{ textAlign: "center", padding: "4px 0" }}>{si.quantity}</td>
                  <td style={{ textAlign: "right", padding: "4px 0" }}>₱{si.unit_price.toFixed(2)}</td>
                  <td style={{ textAlign: "right", padding: "4px 0" }}>₱{si.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ borderTop: "1px dashed #000", paddingTop: 10, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span>Subtotal</span><span>₱{printTarget.subtotal.toFixed(2)}</span>
            </div>
            {printTarget.discount_amount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span>Discount ({printTarget.discount_type_name ?? `Custom ${printTarget.custom_discount_percent}%`})</span>
                <span>−₱{printTarget.discount_amount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14, marginTop: 4, borderTop: "1px solid #000", paddingTop: 4 }}>
              <span>TOTAL</span><span>₱{printTarget.total_amount.toFixed(2)}</span>
            </div>
          </div>

          {printTarget.note && (
            <div style={{ marginTop: 12, fontSize: 11, borderTop: "1px dashed #000", paddingTop: 8 }}>
              Note: {printTarget.note}
            </div>
          )}
          {printTarget.is_void && (
            <div style={{ marginTop: 10, fontWeight: 700, textAlign: "center", fontSize: 14 }}>*** VOID ***</div>
          )}
          <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, borderTop: "1px dashed #000", paddingTop: 10 }}>
            Thank you!
          </div>
        </div>
      )}
    </div>
  );
}
