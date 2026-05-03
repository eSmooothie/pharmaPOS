import { useState, useEffect } from "react";
import api from "../api";
import { getTimezone } from "../utils/date";

// en-CA locale produces YYYY-MM-DD, the format HTML date inputs require.
function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: getTimezone() });
}

function firstOfMonth() {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: getTimezone() });
  return s.slice(0, 7) + "-01";
}

function downloadCsv(startDate, endDate) {
  const a = document.createElement("a");
  a.href = `/api/reports/sales-csv?start_date=${startDate}&end_date=${endDate}`;
  a.download = `sales_${startDate}_to_${endDate}.csv`;
  a.click();
}

// ── Overall Report tab ────────────────────────────────────────────────────────
function OverallReport() {
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await api.get("/reports/overall", {
        params: { start_date: startDate, end_date: endDate },
      });
      setData(r.data);
    } catch {
      setError("Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  const kpis = data
    ? [
        { label: "Total Revenue",      value: `₱${data.total_revenue.toFixed(2)}`,      color: "#4f46e5" },
        { label: "Transactions",        value: data.transaction_count,                   color: "#10b981" },
        { label: "Avg per Transaction", value: `₱${data.avg_transaction.toFixed(2)}`,   color: "#0ea5e9" },
        { label: "Total Discounted",    value: `₱${data.total_discounted.toFixed(2)}`,  color: "#f59e0b" },
        { label: "Voided",              value: data.voided_count,                        color: "#ef4444" },
      ]
    : [];

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="form-field">
          <label className="form-label">From</label>
          <input className="input" type="date" value={startDate}
            onChange={e => setStartDate(e.target.value)} style={{ width: 160 }} />
        </div>
        <div className="form-field">
          <label className="form-label">To</label>
          <input className="input" type="date" value={endDate}
            onChange={e => setEndDate(e.target.value)} style={{ width: 160 }} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Load"}
        </button>
        <button
          className="btn btn-outline"
          onClick={() => downloadCsv(startDate, endDate)}
          title="Download sales as CSV (Excel-compatible)"
        >
          ⬇ Download CSV
        </button>
      </div>

      {error && <div className="alert-error" style={{ marginBottom: 14 }}>{error}</div>}

      {data && (
        <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
            {kpis.map(({ label, value, color }) => (
              <div key={label} className="card" style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Payment breakdown */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Payment Methods</div>
              {data.payment_breakdown.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px 0" }}>No data</div>
              ) : (
                <table>
                  <thead><tr><th>Method</th><th>Transactions</th><th>Total</th></tr></thead>
                  <tbody>
                    {data.payment_breakdown.map(p => (
                      <tr key={p.method}>
                        <td style={{ textTransform: "capitalize" }}>{p.method}</td>
                        <td>{p.count}</td>
                        <td>₱{p.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Discount breakdown */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Discount Breakdown</div>
              {data.discount_breakdown.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px 0" }}>No discounts applied</div>
              ) : (
                <table>
                  <thead><tr><th>Type</th><th>Transactions</th><th>Total Discount</th></tr></thead>
                  <tbody>
                    {data.discount_breakdown.map(d => (
                      <tr key={d.name}>
                        <td>{d.name}</td>
                        <td>{d.count}</td>
                        <td>₱{d.total_discount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Revenue by day */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Revenue by Day</div>
            {data.revenue_by_day.length === 0 ? (
              <div className="empty-state" style={{ padding: "20px 0" }}>No sales in this period</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Transactions</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {data.revenue_by_day.map(row => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{row.count}</td>
                        <td>₱{row.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, borderTop: "2px solid #e2e8f0" }}>
                      <td>Total</td>
                      <td>{data.transaction_count}</td>
                      <td>₱{data.total_revenue.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top items */}
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Top Selling Items</div>
            {data.top_items.length === 0 ? (
              <div className="empty-state" style={{ padding: "20px 0" }}>No sales in this period</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Type</th><th>Item</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {data.top_items.map((item, i) => (
                      <tr key={i}>
                        <td style={{ color: "#94a3b8" }}>{i + 1}</td>
                        <td>
                          <span className={`badge ${item.type === "medicine" ? "badge-med" : "badge-groc"}`}>
                            {item.type === "medicine" ? "💊" : "🧺"}
                          </span>
                        </td>
                        <td>{item.name}</td>
                        <td>{item.qty}</td>
                        <td>₱{item.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="empty-state">Select a date range and click Load to view the report.</div>
      )}
    </div>
  );
}

// ── Reports page ──────────────────────────────────────────────────────────────
export default function Reports() {
  const [tab, setTab] = useState("overall");

  // Daily
  const [date, setDate] = useState(today);
  const [daily, setDaily] = useState(null);

  // Expiring
  const [days, setDays] = useState(30);
  const [expiring, setExpiring] = useState([]);

  // Inventory
  const [inventory, setInventory] = useState([]);
  const [invFilter, setInvFilter] = useState("");

  useEffect(() => {
    if (tab === "daily") loadDaily();
    if (tab === "expiring") loadExpiring();
    if (tab === "inventory") loadInventory();
  }, [tab]);

  async function loadDaily() {
    const r = await api.get("/reports/daily", { params: { date } });
    setDaily(r.data);
  }

  async function loadExpiring() {
    const r = await api.get("/reports/expiring", { params: { days } });
    setExpiring(r.data);
  }

  async function loadInventory() {
    const r = await api.get("/reports/inventory");
    setInventory(r.data);
  }

  const tabStyle = (t) => ({
    padding: "8px 16px",
    color: tab === t ? "#4f46e5" : "#64748b",
    cursor: "pointer",
    fontWeight: tab === t ? 700 : 500,
    fontSize: 13,
    background: "none",
    border: "none",
    borderBottom: tab === t ? "2px solid #4f46e5" : "2px solid transparent",
  });

  const filteredInventory = inventory.filter(i =>
    i.name.toLowerCase().includes(invFilter.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <h2>Reports</h2>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
        <button style={tabStyle("overall")}   onClick={() => setTab("overall")}>Overall</button>
        <button style={tabStyle("daily")}     onClick={() => setTab("daily")}>Daily Summary</button>
        <button style={tabStyle("expiring")}  onClick={() => setTab("expiring")}>Expiring Batches</button>
        <button style={tabStyle("inventory")} onClick={() => setTab("inventory")}>Inventory Snapshot</button>
      </div>

      {/* ── Overall ── */}
      {tab === "overall" && <OverallReport />}

      {/* ── Daily Summary ── */}
      {tab === "daily" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="form-field">
              <label className="form-label">Date</label>
              <input className="input" type="date" value={date}
                onChange={e => setDate(e.target.value)} style={{ width: 160 }} />
            </div>
            <button className="btn btn-primary" onClick={loadDaily}>Load</button>
            <button
              className="btn btn-outline"
              onClick={() => downloadCsv(date, date)}
              title="Download this day's sales as CSV"
            >
              ⬇ Download CSV
            </button>
          </div>

          {daily && (
            <>
              {/* KPI cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total Revenue",    value: `₱${daily.total_revenue.toFixed(2)}`, color: "#4f46e5" },
                  { label: "Transactions",     value: daily.transaction_count,               color: "#10b981" },
                  { label: "Total Discounted", value: `₱${daily.discount_breakdown.reduce((s, d) => s + d.total_discount, 0).toFixed(2)}`, color: "#f59e0b" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="card" style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Discount breakdown */}
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Discount Breakdown</div>
                  {daily.discount_breakdown.length === 0 ? (
                    <div className="empty-state" style={{ padding: "20px 0" }}>No discounts applied</div>
                  ) : (
                    <table>
                      <thead><tr><th>Type</th><th>Transactions</th><th>Total Discount</th></tr></thead>
                      <tbody>
                        {daily.discount_breakdown.map(d => (
                          <tr key={d.name}>
                            <td>{d.name}</td>
                            <td>{d.count}</td>
                            <td>₱{d.total_discount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Top-selling items */}
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Top Selling Items</div>
                  {daily.top_items.length === 0 ? (
                    <div className="empty-state" style={{ padding: "20px 0" }}>No sales on this date</div>
                  ) : (
                    <table>
                      <thead><tr><th>#</th><th>Item</th><th>Type</th><th>Qty</th></tr></thead>
                      <tbody>
                        {daily.top_items.map((item, i) => (
                          <tr key={i}>
                            <td style={{ color: "#94a3b8" }}>{i + 1}</td>
                            <td>{item.name}</td>
                            <td>
                              <span className={`badge ${item.type === "medicine" ? "badge-med" : "badge-groc"}`}>
                                {item.type === "medicine" ? "💊" : "🧺"}
                              </span>
                            </td>
                            <td>{item.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Expiring Batches ── */}
      {tab === "expiring" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
            <div className="form-field">
              <label className="form-label">Expiring within (days)</label>
              <select className="select" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 120 }}>
                {[30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={loadExpiring}>Load</button>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Medicine</th><th>Brand</th><th>Batch #</th>
                  <th>Expiry Date</th><th>Qty Remaining</th>
                </tr></thead>
                <tbody>
                  {expiring.length === 0 && (
                    <tr><td colSpan={5}><div className="empty-state">No batches expiring within {days} days</div></td></tr>
                  )}
                  {expiring.map(b => {
                    const daysLeft = Math.ceil((new Date(b.expiry_date) - new Date()) / 86400000);
                    return (
                      <tr key={b.batch_id}>
                        <td><strong>{b.generic_name}</strong></td>
                        <td>{b.brand_name}</td>
                        <td>{b.batch_number || "—"}</td>
                        <td>
                          <span style={{ color: daysLeft <= 7 ? "#ef4444" : daysLeft <= 30 ? "#f59e0b" : "#64748b", fontWeight: daysLeft <= 30 ? 700 : undefined }}>
                            {b.expiry_date}
                            {daysLeft <= 30 && <span style={{ fontSize: 11, marginLeft: 6 }}>({daysLeft}d left)</span>}
                          </span>
                        </td>
                        <td>{b.qty_remaining}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Inventory Snapshot ── */}
      {tab === "inventory" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <input className="input" placeholder="Filter by name…" value={invFilter}
              onChange={e => setInvFilter(e.target.value)} style={{ maxWidth: 300 }} />
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Type</th><th>Name</th><th>Unit</th><th>Price</th><th>Stock</th>
                </tr></thead>
                <tbody>
                  {filteredInventory.length === 0 && (
                    <tr><td colSpan={5}><div className="empty-state">No items</div></td></tr>
                  )}
                  {filteredInventory.map(item => (
                    <tr key={`${item.type}-${item.id}`}>
                      <td>
                        <span className={`badge ${item.type === "medicine" ? "badge-med" : "badge-groc"}`}>
                          {item.type === "medicine" ? "💊 Med" : "🧺 Groc"}
                        </span>
                      </td>
                      <td>{item.name}</td>
                      <td>{item.unit}</td>
                      <td>₱{item.price.toFixed(2)}</td>
                      <td>{item.stock_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
