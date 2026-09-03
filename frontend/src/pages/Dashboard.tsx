import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getHealth, HealthResponse } from "../api/client";
import ChangePasswordCard from "../components/ChangePasswordCard";

const roleLabel = (user: ReturnType<typeof useAuth>["user"]): string => {
  if (!user) return "";
  if (user.is_superadmin) return "Super Admin";
  if (user.memberships.length === 0) return "No branch assigned";
  const roles = Array.from(new Set(user.memberships.map((m) => m.role)));
  return roles.join(", ");
};

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="app" data-testid="dashboard-root">
      <header className="topbar">
        <div className="brand" data-testid="brand-logo">
          <span className="brand-mark">CUGO</span>
          <span className="brand-dot" />
          <span className="brand-sub">App</span>
        </div>
        <div className="topbar-right">
          <button className="btn-primary" onClick={() => navigate("/orders")} data-testid="nav-orders">
            Transaksi
          </button>
          <button className="btn-ghost" onClick={() => navigate("/customers")} data-testid="nav-customers">
            Customers
          </button>
          <button className="btn-ghost" onClick={() => navigate("/services")} data-testid="nav-services">
            Services
          </button>
          {user?.is_superadmin && (
            <>
              <button className="btn-ghost" onClick={() => navigate("/branches")} data-testid="nav-branches">Branches</button>
              <button className="btn-ghost" onClick={() => navigate("/users")} data-testid="nav-users">Users</button>
            </>
          )}
          <span className="user-chip" data-testid="user-email">{user?.email}</span>
          <button className="btn-ghost" onClick={logout} data-testid="logout-button">Sign out</button>
        </div>
      </header>

      <main className="hero">
        <p className="eyebrow">Signed in</p>
        <h1 className="title">Welcome back</h1>
        <p className="subtitle">You are authenticated. Master data and laundry features will appear here as we build them.</p>

        <section className="status-card" data-testid="account-card">
          <div className="status-card-head"><h2>Your account</h2></div>
          <ul className="status-list">
            <li className="status-row"><span className="status-label">Email</span><span className="status-value" data-testid="account-email">{user?.email}</span></li>
            <li className="status-row"><span className="status-label">Role</span><span className="badge badge-ok" data-testid="user-role">{roleLabel(user)}</span></li>
            <li className="status-row"><span className="status-label">Database (PostgreSQL)</span><span className={`badge ${health?.database === "connected" ? "badge-ok" : "badge-wait"}`} data-testid="status-db-badge">{health?.database === "connected" ? "Connected" : "Checking…"}</span></li>
          </ul>
        </section>

        <ChangePasswordCard />
      </main>
      <footer className="footer"><span>CUGO App · v0.1.0</span></footer>
    </div>
  );
};

export default Dashboard;
