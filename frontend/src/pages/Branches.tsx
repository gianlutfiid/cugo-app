import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminCreateBranch,
  adminUpdateBranch,
  Branch,
  formatApiError,
  listBranches,
} from "../api/client";

const Branches: React.FC = () => {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      setBranches(await listBranches());
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  return (
    <div className="app" data-testid="branches-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CUGO</span>
          <span className="brand-dot" />
          <span className="brand-sub">App</span>
        </div>
        <div className="topbar-right">
          <button className="btn-ghost" onClick={() => navigate("/")} data-testid="back-to-dashboard">
            Dashboard
          </button>
          <button className="btn-primary" onClick={() => setShowCreate(true)} data-testid="create-branch-button">
            Add branch
          </button>
        </div>
      </header>

      <main className="hero branches-main">
        <p className="eyebrow">Administration</p>
        <h1 className="title">Branches</h1>
        <p className="subtitle">Manage CUGO branches and their operational status.</p>

        {error && <div className="auth-error" data-testid="branches-error">{error}</div>}

        {loading ? (
          <div className="spinner" />
        ) : branches.length === 0 ? (
          <section className="status-card">
            <h2 className="modal-title">No branches yet</h2>
            <p className="muted">Create your first branch to start assigning users and building branch operations.</p>
          </section>
        ) : (
          <div className="table-wrap">
            <table className="data-table" data-testid="branches-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Code</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id} data-testid={`branch-row-${branch.code}`}>
                    <td>
                      <strong>{branch.name}</strong>
                      {branch.address && <div className="muted">{branch.address}</div>}
                    </td>
                    <td><span className="badge badge-navy">{branch.code}</span></td>
                    <td>{branch.phone || "—"}</td>
                    <td>
                      <span className={`badge ${branch.is_active ? "badge-ok" : "badge-down"}`}>
                        {branch.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(branch)} data-testid={`manage-branch-${branch.code}`}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {(showCreate || editing) && (
        <BranchModal
          branch={editing}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSaved={async () => { setShowCreate(false); setEditing(null); await refresh(); }}
        />
      )}
    </div>
  );
};

interface BranchModalProps {
  branch: Branch | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const BranchModal: React.FC<BranchModalProps> = ({ branch, onClose, onSaved }) => {
  const [name, setName] = useState(branch?.name ?? "");
  const [code, setCode] = useState(branch?.code ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [timezone, setTimezone] = useState(branch?.timezone ?? "Asia/Jakarta");
  const [isActive, setIsActive] = useState(branch?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim() || (!branch && !code.trim())) {
      setError("Branch name and code are required.");
      return;
    }
    setSaving(true);
    try {
      if (branch) {
        await adminUpdateBranch(branch.id, {
          name: name.trim(),
          address: address.trim() || null,
          phone: phone.trim() || null,
          timezone: timezone.trim(),
          is_active: isActive,
        });
      } else {
        await adminCreateBranch({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          address: address.trim() || null,
          phone: phone.trim() || null,
          timezone: timezone.trim(),
        });
      }
      await onSaved();
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="branch-modal">
      <form className="modal-card" onSubmit={submit}>
        <h2 className="modal-title">{branch ? "Manage branch" : "Add branch"}</h2>
        <p className="modal-note">Branch codes are unique and cannot be changed after creation.</p>

        <label className="field">
          <span className="field-label">Branch name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="CUGO Bintaro" data-testid="branch-name-input" />
        </label>
        <label className="field">
          <span className="field-label">Branch code</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BINTARO" disabled={!!branch} data-testid="branch-code-input" />
        </label>
        <label className="field">
          <span className="field-label">Address</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Branch address" data-testid="branch-address-input" />
        </label>
        <label className="field">
          <span className="field-label">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" data-testid="branch-phone-input" />
        </label>
        <label className="field">
          <span className="field-label">Timezone</span>
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Jakarta" data-testid="branch-timezone-input" />
        </label>

        {branch && (
          <label className="status-row">
            <span className="status-label">Operational status</span>
            <span className="confirm-row">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} data-testid="branch-active-input" />
              Active
            </span>
          </label>
        )}

        {error && <div className="auth-error" data-testid="branch-form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving} data-testid="branch-save-button">
            {saving ? "Saving…" : "Save branch"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Branches;
