import React, { useState } from "react";
import {
  adminRemoveMembership,
  adminResetPassword,
  adminUpdateUser,
  adminUpsertMembership,
  AdminUser,
  Branch,
  BranchRole,
  formatApiError,
} from "../../api/client";

interface Props {
  user: AdminUser;
  branches: Branch[];
  onClose: () => void;
  onChanged: (user: AdminUser) => void;
  onPassword: (password: string) => void;
}

const EditUserModal: React.FC<Props> = ({ user, branches, onClose, onChanged, onPassword }) => {
  const [current, setCurrent] = useState<AdminUser>(user);
  const [name, setName] = useState(user.full_name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"deactivate" | "reset" | null>(null);
  const [addBranch, setAddBranch] = useState("");
  const [addRole, setAddRole] = useState<BranchRole>("staff");

  const apply = (u: AdminUser) => {
    setCurrent(u);
    onChanged(u);
  };
  const handle = async (fn: () => Promise<AdminUser>) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      apply(await fn());
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail) || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const saveName = () => handle(() => adminUpdateUser(current.id, { full_name: name }));
  const toggleActive = () =>
    handle(async () => {
      const u = await adminUpdateUser(current.id, { is_active: !current.is_active });
      setConfirm(null);
      return u;
    });
  const changeRole = (branchId: string, role: BranchRole) =>
    handle(() => adminUpsertMembership(current.id, { branch_id: branchId, role }));
  const removeMembership = (branchId: string) =>
    handle(() => adminRemoveMembership(current.id, branchId));
  const addMembership = () => {
    if (!addBranch) return;
    handle(() => adminUpsertMembership(current.id, { branch_id: addBranch, role: addRole }));
    setAddBranch("");
  };
  const resetPassword = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { initial_password } = await adminResetPassword(current.id);
      setConfirm(null);
      onPassword(initial_password);
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail) || "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const assignedIds = new Set(current.memberships.map((m) => m.branch_id));
  const available = branches.filter((b) => !assignedIds.has(b.id));

  return (
    <div className="modal-overlay" data-testid="edit-user-modal">
      <div className="modal-card">
        <h2 className="modal-title">Manage {current.email}</h2>

        <label className="field">
          <span className="field-label">Full name</span>
          <div className="inline-field">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="edit-name-input"
            />
            <button className="btn-ghost" onClick={saveName} data-testid="edit-name-save">
              Save
            </button>
          </div>
        </label>

        <div className="memberships-block">
          <span className="field-label">Branch assignments</span>
          {current.memberships.length === 0 && (
            <p className="muted">No branches assigned.</p>
          )}
          {current.memberships.map((m) => (
            <div className="membership-row" key={m.branch_id} data-testid={`membership-${m.branch_code}`}>
              <span className="membership-name">
                {m.branch_code} — {m.branch_name}
              </span>
              <select
                value={m.role}
                onChange={(e) => changeRole(m.branch_id, e.target.value as BranchRole)}
                data-testid={`role-select-${m.branch_code}`}
              >
                <option value="branch_admin">branch_admin</option>
                <option value="staff">staff</option>
              </select>
              <button
                className="btn-remove"
                onClick={() => removeMembership(m.branch_id)}
                data-testid={`remove-membership-${m.branch_code}`}
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}

          {available.length > 0 && (
            <div className="membership-row">
              <select
                value={addBranch}
                onChange={(e) => setAddBranch(e.target.value)}
                data-testid="add-branch-select"
              >
                <option value="">Select branch…</option>
                {available.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                    {b.is_active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as BranchRole)}
                data-testid="add-role-select"
              >
                <option value="branch_admin">branch_admin</option>
                <option value="staff">staff</option>
              </select>
              <button className="btn-ghost" onClick={addMembership} data-testid="add-membership-confirm">
                Add
              </button>
            </div>
          )}
        </div>

        {error && <div className="auth-error" data-testid="edit-error">{error}</div>}

        <div className="danger-zone">
          {confirm === "deactivate" ? (
            <div className="confirm-row" data-testid="confirm-deactivate">
              <span>{current.is_active ? "Deactivate this user?" : "Activate this user?"}</span>
              <button className="btn-danger" onClick={toggleActive} data-testid="confirm-toggle-active">
                Yes
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(null)}>No</button>
            </div>
          ) : (
            <button
              className={current.is_active ? "btn-danger" : "btn-primary"}
              onClick={() => setConfirm("deactivate")}
              data-testid="toggle-active-button"
            >
              {current.is_active ? "Deactivate user" : "Activate user"}
            </button>
          )}

          {confirm === "reset" ? (
            <div className="confirm-row" data-testid="confirm-reset">
              <span>Reset this user's password?</span>
              <button className="btn-danger" onClick={resetPassword} data-testid="confirm-reset-password">
                Yes, reset
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          ) : (
            <button
              className="btn-ghost"
              onClick={() => setConfirm("reset")}
              data-testid="reset-password-button"
            >
              Reset password
            </button>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose} data-testid="edit-close-button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditUserModal;
