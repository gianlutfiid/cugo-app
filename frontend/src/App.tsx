import React, { useEffect, useState } from "react";
import "./App.css";
import { getHealth, HealthResponse } from "./api/client";

type Status = "loading" | "online" | "offline";

function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    getHealth()
      .then((data) => {
        if (!mounted) return;
        setHealth(data);
        setStatus("online");
      })
      .catch(() => {
        if (mounted) setStatus("offline");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const dbConnected = health?.database === "connected";

  return (
    <div className="app" data-testid="app-root">
      <header className="topbar" data-testid="topbar">
        <div className="brand" data-testid="brand-logo">
          <span className="brand-mark">CUGO</span>
          <span className="brand-dot" />
          <span className="brand-sub">App</span>
        </div>
        <span className="env-pill" data-testid="env-pill">
          {health?.environment ?? "—"}
        </span>
      </header>

      <main className="hero" data-testid="hero">
        <p className="eyebrow" data-testid="hero-eyebrow">
          Multi-branch laundry management
        </p>
        <h1 className="title" data-testid="hero-title">
          CUGO App
        </h1>
        <p className="subtitle" data-testid="hero-subtitle">
          Project foundation is initialized and running. Business features will
          be built here step by step.
        </p>

        <section className="status-card" data-testid="status-card">
          <div className="status-card-head">
            <h2 data-testid="status-title">System status</h2>
          </div>
          <ul className="status-list">
            <li className="status-row" data-testid="status-api">
              <span className="status-label">API service</span>
              <span
                className={`badge ${status === "online" ? "badge-ok" : status === "loading" ? "badge-wait" : "badge-down"}`}
                data-testid="status-api-badge"
              >
                {status === "online"
                  ? "Online"
                  : status === "loading"
                    ? "Checking…"
                    : "Offline"}
              </span>
            </li>
            <li className="status-row" data-testid="status-db">
              <span className="status-label">Database (PostgreSQL)</span>
              <span
                className={`badge ${status === "loading" ? "badge-wait" : dbConnected ? "badge-ok" : "badge-down"}`}
                data-testid="status-db-badge"
              >
                {status === "loading"
                  ? "Checking…"
                  : dbConnected
                    ? "Connected"
                    : "Disconnected"}
              </span>
            </li>
          </ul>
        </section>
      </main>

      <footer className="footer" data-testid="footer">
        <span>CUGO App · v0.1.0</span>
      </footer>
    </div>
  );
}

export default App;
