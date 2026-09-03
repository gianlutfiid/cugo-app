import React, { useState } from "react";
import {
  adminCreateUser,
  AdminUser,
  Branch,
  BranchRole,
  formatApiError,
  MembershipInput,
} from "../../api/client";

interface Props {
  branches: Branch[];
  onClose: () => void;
  onCreated: (user: AdminUser, password: string) => void;
}

const CreateUserModal: React.FC<Props> = ({ branches, onClose, onCreated }) => {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [rows, setRows] = useState<MembershipInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const addRow = () =>
    setRows((r) => [...r, { branch_id: branches[0]?.id ?? "", role: "staff" }]);
  const updateRow = (i: number, patch: Partial<MembershipInput>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    // Drop incomplete rows and de-dupe by branch.
    const seen = new Set<string>();
    const memberships = rows.filter((r) => {
      if (!r.branch_id || seen.has(r.branch_id)) return false;
      seen.add(r.branch_id);
      return true;
    });

    setSubmitting(true);
    try {
      const { user, initial_password } = await adminCreateUser({
        email: email.trim(),
        full_name: fullName.trim() || null,
        memberships,
      });
      onCreated(user, initial_password);
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail) || "Unable to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="create-user-modal">
      <form className="modal-card" onSubmit={submit}>
        <h2 className="modal-title">Create user</h2>

        <label className="field">
          <span className="field-label">Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            data-testid="create-name-input"
          />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@cugo.app"
            data-testid="create-email-input"
          />
        </label>

        <div className="memberships-block">
          <div className="memberships-head">
            <span className="field-label">Branch assignments</span>
            <button
              type="button"
              className="btn-link"
              onClick={addRow}
              disabled={branches.length === 0}
              data-testid="add-membership-button"
            >
              + Add branch
            </button>
          </div>
          {rows.length === 0 && (
            <p className="muted">No branches assigned yet (you can add them later).</p>
          )}
          {rows.map((row, i) => (
            <div className="membership-row" key={i}>
              <select
                value={row.branch_id}
                onChange={(e) => updateRow(i, { branch_id: e.target.value })}
                data-testid={`create-branch-select-${i}`}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                    {b.is_active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
              <select
                value={row.role}
                onChange={(e) => updateRow(i, { role: e.target.value as BranchRole })}
                data-testid={`create-role-select-${i}`}
              >
                <option value="branch_admin">branch_admin</option>
                <option value="staff">staff</option>
              </select>
              <button
                type="button"
                className="btn-remove"
                onClick={() => removeRow(i)}
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {error && (
          <div className="auth-error" data-testid="create-error">
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            data-testid="create-submit-button"
          >
            {submitting ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateUserModal;
