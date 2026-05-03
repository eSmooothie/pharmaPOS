import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import api from "../api";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week",  label: "This Week" },
  { key: "month", label: "This Month" },
];

const PIE_COLORS = ["#4f46e5", "#10b981"];

const fmt = (n) =>
  `₱${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function KPICard({ label, value, accent }) {
  return (
    <div style={{
      flex: "1 1 140px",
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 10,
      padding: "14px 18px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || "#1e293b" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [range, setRange]   = useState("today");
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  useEffect(() => { load(); }, [range]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await api.get("/reports/dashboard", { params: { range } });
      setData(r.data);
    } catch {
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  const categoryData = data
    ? [
        { name: "Medicines", value: data.medicine_revenue },
        { name: "Grocery",   value: data.grocery_revenue  },
      ]
    : [];

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>📊 Dashboard</div>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              className={`btn btn-sm ${range === r.key ? "btn-primary" : "btn-outline"}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="empty-state">Loading…</div>}
      {error   && <div className="alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {data && !loading && (
        <>
          {/* ── KPI Cards ── */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <KPICard label="Total Revenue"     value={fmt(data.total_revenue)} />
            <KPICard label="Transactions"      value={data.transaction_count.toLocaleString()} />
            <KPICard label="Items Sold"        value={data.items_sold.toLocaleString()} />
            <KPICard label="Avg. Transaction"  value={fmt(data.avg_transaction)} />
            {data.low_stock_count > 0 && (
              <KPICard
                label="Low Stock Items"
                value={data.low_stock_count}
                accent="#dc2626"
              />
            )}
          </div>

          {/* ── Row 1: Sales over time + Category pie ── */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>

            {/* Sales over time */}
            <div style={{
              flex: "2 1 300px", background: "#fff",
              border: "1px solid #e2e8f0", borderRadius: 10, padding: 16,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#334155" }}>
                Sales Over Time
              </div>
              {data.revenue_by_day.length === 0 ? (
                <div className="empty-state" style={{ height: 200 }}>No sales in this period</div>
              ) : data.revenue_by_day.length === 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.revenue_by_day} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`}
                      width={52}
                    />
                    <Tooltip formatter={(v) => [fmt(v), "Revenue"]} />
                    <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.revenue_by_day} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`}
                      width={52}
                    />
                    <Tooltip formatter={(v) => [fmt(v), "Revenue"]} />
                    <Line
                      type="monotone" dataKey="revenue"
                      stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue by category */}
            <div style={{
              flex: "1 1 200px", background: "#fff",
              border: "1px solid #e2e8f0", borderRadius: 10, padding: 16,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#334155" }}>
                Revenue by Category
              </div>
              {(data.medicine_revenue + data.grocery_revenue) === 0 ? (
                <div className="empty-state" style={{ height: 200 }}>No data</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%" cy="50%"
                        innerRadius={48} outerRadius={76}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {categoryData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 12, marginTop: 4 }}>
                    <span><span style={{ color: "#4f46e5", fontWeight: 700 }}>●</span> Medicines — {fmt(data.medicine_revenue)}</span>
                    <span><span style={{ color: "#10b981", fontWeight: 700 }}>●</span> Grocery — {fmt(data.grocery_revenue)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Row 2: Top products + Discounts ── */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>

            {/* Top 10 products */}
            <div style={{
              flex: "2 1 300px", background: "#fff",
              border: "1px solid #e2e8f0", borderRadius: 10, padding: 16,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#334155" }}>
                Top 10 Products <span style={{ fontWeight: 400, color: "#94a3b8" }}>(by qty sold)</span>
              </div>
              {data.top_items.length === 0 ? (
                <div className="empty-state">No sales data</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(220, data.top_items.length * 30)}>
                    <BarChart
                      data={data.top_items}
                      layout="vertical"
                      margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={160}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => v.length > 24 ? v.slice(0, 24) + "…" : v}
                      />
                      <Tooltip
                        formatter={(v) => [v, "Qty Sold"]}
                        labelFormatter={(label) => label}
                      />
                      <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                        {data.top_items.map((item, i) => (
                          <Cell key={i} fill={item.type === "medicine" ? "#4f46e5" : "#10b981"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#64748b" }}>
                    <span><span style={{ color: "#4f46e5", fontWeight: 700 }}>●</span> Medicine</span>
                    <span><span style={{ color: "#10b981", fontWeight: 700 }}>●</span> Grocery</span>
                  </div>
                </>
              )}
            </div>

            {/* Discount breakdown */}
            <div style={{
              flex: "1 1 200px", background: "#fff",
              border: "1px solid #e2e8f0", borderRadius: 10, padding: 16,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#334155" }}>
                Discount Usage
              </div>
              {data.discount_breakdown.length === 0 ? (
                <div className="empty-state">No discounts applied</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {data.discount_breakdown.map((d) => (
                    <div key={d.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, color: "#334155" }}>{d.name}</span>
                        <span style={{ color: "#64748b" }}>{d.count} txn{d.count !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#dc2626" }}>
                        −{fmt(d.total_discount)} total discount
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
