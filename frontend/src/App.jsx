import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import api from "./api";
import Sales from "./pages/Sales";
import MedicineInventory from "./pages/MedicineInventory";
import GroceryInventory from "./pages/GroceryInventory";
import LowStock from "./pages/LowStock";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

const NAV = [
  { to: "/",          label: "Sales",     icon: "🛒" },
  { to: "/medicines", label: "Medicines", icon: "💊" },
  { to: "/grocery",   label: "Grocery",   icon: "🧺" },
  { to: "/low-stock", label: "Low Stock", icon: "⚠️" },
  { to: "/reports",   label: "Reports",   icon: "📊" },
  { to: "/settings",  label: "Settings",  icon: "⚙️" },
];

export default function App() {
  const [appTitle, setAppTitle] = useState("PharmaPOS");
  const [lowStockCount, setLowStockCount] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  function refreshTitle() {
    api.get("/business-info").then(r => {
      const name = r.data?.business_name?.trim();
      setAppTitle(name || "PharmaPOS");
    }).catch(() => {});
  }

  // Load timezone once on startup and store it globally for date formatting.
  useEffect(() => {
    api.get("/system-settings").then(r => {
      window.__pharmaPOSTz = r.data.timezone || "Asia/Manila";
    }).catch(() => {
      window.__pharmaPOSTz = "Asia/Manila";
    });
    window.addEventListener("systemsettings:updated", e => {
      window.__pharmaPOSTz = e.detail?.timezone || "Asia/Manila";
    });
  }, []);

  function refreshLowStock() {
    api.get("/reports/low-stock").then(r => setLowStockCount(r.data.length)).catch(() => {});
  }

  useEffect(() => {
    document.title = appTitle;
  }, [appTitle]);

  useEffect(() => {
    refreshTitle();
    window.addEventListener("businessinfo:updated", refreshTitle);
    return () => window.removeEventListener("businessinfo:updated", refreshTitle);
  }, []);

  useEffect(() => {
    refreshLowStock();
    window.addEventListener("stock:updated", refreshLowStock);
    const interval = setInterval(refreshLowStock, 60_000);
    return () => {
      window.removeEventListener("stock:updated", refreshLowStock);
      clearInterval(interval);
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar">
          <span className="topbar-title">💊 {appTitle}</span>
          <span className="topbar-sub">
            {now.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            {" · "}
            {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </header>
        <div className="body-row">
          <nav className="sidebar">
            {NAV.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
              >
                <span>{icon}</span>
                <span>{label}</span>
                {to === "/low-stock" && lowStockCount > 0 && (
                  <span className="nav-badge">{lowStockCount}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <main className="page-content">
            <Routes>
              <Route path="/"          element={<Sales />} />
              <Route path="/medicines" element={<MedicineInventory />} />
              <Route path="/grocery"   element={<GroceryInventory />} />
              <Route path="/low-stock" element={<LowStock />} />
              <Route path="/reports"   element={<Reports />} />
              <Route path="/settings"  element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
