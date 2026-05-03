import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function LowStock() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/reports/low-stock").then(r => {
      setItems(r.data);
      setLoading(false);
    });
  }, []);

  function handleRestock(item) {
    navigate(item.type === "medicine" ? "/medicines" : "/grocery");
  }

  return (
    <div>
      <div className="page-header">
        <h2>Low Stock</h2>
        <button className="btn btn-outline btn-sm" onClick={() => {
          setLoading(true);
          api.get("/reports/low-stock").then(r => { setItems(r.data); setLoading(false); });
        }}>Refresh</button>
      </div>

      {!loading && items.length === 0 && (
        <div className="card">
          <div className="empty-state" style={{ padding: "60px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            All items are above their reorder levels.
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Type</th><th>Item</th><th>Stock</th><th>Reorder Level</th><th>Shortage</th><th></th>
              </tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={`${item.type}-${item.id}`}>
                    <td>
                      <span className={`badge ${item.type === "medicine" ? "badge-med" : "badge-groc"}`}>
                        {item.type === "medicine" ? "💊 Medicine" : "🧺 Grocery"}
                      </span>
                    </td>
                    <td><strong>{item.name}</strong></td>
                    <td style={{ color: "#ef4444", fontWeight: 700 }}>{item.stock_qty}</td>
                    <td>{item.reorder_level}</td>
                    <td>
                      <span className="badge badge-warn">
                        {item.reorder_level - item.stock_qty} short
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => handleRestock(item)}>
                        Go to {item.type === "medicine" ? "Medicines" : "Grocery"}
                      </button>
                    </td>
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
