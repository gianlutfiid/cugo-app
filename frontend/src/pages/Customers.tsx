import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Branch, Customer, formatApiError, listBranches, listCustomers } from "../api/client";
import CustomerModal from "../components/customers/CustomerModal";

const Customers: React.FC = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCustomers({
        branch_id: branchId || undefined,
        q: search.trim() || undefined,
        include_inactive: includeInactive,
      });
      setCustomers(data);
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([listBranches(), listCustomers()])
      .then(([b, c]) => {
        setBranches(b);
        setCustomers(c);
        if (b.length === 1) setBranchId(b[0].id);
      })
      .catch((err) => setError(formatApiError(err.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [branchId, includeInactive]);

  const branchName = (id: string) => {
    const b = branchMap.get(id);
    return b ? `${b.code} — ${b.name}` : "—";
  };

  return (
    <div className="app" data-testid="customers-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CUGO</span>
          <span className="brand-dot" />
          <span className="brand-sub">App</span>
        </div>
        <div className="topbar-right">
          <button className="btn-ghost" onClick={() => navigate("/")}>Dashboard</button>
          <button className="btn-primary" onClick={() => setShowCreate(true)} disabled={branches.length === 0} data-testid="create-customer-button">
            Add customer
          </button>
        </div>
      </header>

      <main className="hero users-main">
        <p className="eyebrow">Master Data</p>
        <h1 className="title">Customers</h1>
        <p className="subtitle">Kelola data pelanggan per cabang untuk digunakan pada transaksi laundry.</p>

        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Cari nama, nomor HP, atau email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="customer-search"
          />
          <select className="select-input toolbar-select" value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="customer-branch-filter">
            <option value="">Semua cabang yang bisa diakses</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
          <label className="checkbox-field toolbar-check">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            <span>Tampilkan nonaktif</span>
          </label>
        </div>

        {error && <div className="auth-error" data-testid="customers-error">{error}</div>}

        {loading ? <div className="spinner" /> : (
          <div className="table-wrap">
            <table className="data-table" data-testid="customers-table">
              <thead>
                <tr><th>Nama</th><th>No. HP</th><th>Email</th><th>Cabang</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr><td colSpan={6} className="empty-cell">Belum ada customer.</td></tr>
                ) : customers.map((customer) => (
                  <tr key={customer.id} data-testid={`customer-row-${customer.id}`}>
                    <td><strong>{customer.name}</strong>{customer.notes && <div className="table-note">{customer.notes}</div>}</td>
                    <td>{customer.phone || "—"}</td>
                    <td>{customer.email || "—"}</td>
                    <td>{branchName(customer.branch_id)}</td>
                    <td><span className={`badge ${customer.is_active ? "badge-ok" : "badge-down"}`}>{customer.is_active ? "Active" : "Inactive"}</span></td>
                    <td><button className="btn-ghost btn-sm" onClick={() => setEditing(customer)}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showCreate && <CustomerModal branches={branches} defaultBranchId={branchId} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refresh(); }} />}
      {editing && <CustomerModal branches={branches} customer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
};

export default Customers;
