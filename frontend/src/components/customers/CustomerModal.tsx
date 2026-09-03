import React, { useEffect, useState } from "react";
import {
  Branch,
  createCustomer,
  Customer,
  formatApiError,
  updateCustomer,
} from "../../api/client";

interface Props {
  branches: Branch[];
  customer?: Customer | null;
  defaultBranchId?: string;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

const CustomerModal: React.FC<Props> = ({
  branches,
  customer,
  defaultBranchId,
  onClose,
  onSaved,
}) => {
  const [branchId, setBranchId] = useState(customer?.branch_id ?? defaultBranchId ?? branches[0]?.id ?? "");
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [active, setActive] = useState(customer?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!customer && !branchId && branches[0]) setBranchId(branches[0].id);
  }, [branches, branchId, customer]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Nama customer wajib diisi.");
      return;
    }
    if (!customer && !branchId) {
      setError("Cabang wajib dipilih.");
      return;
    }

    setSubmitting(true);
    try {
      let saved: Customer;
      if (customer) {
        saved = await updateCustomer(customer.id, {
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          is_active: active,
        });
      } else {
        saved = await createCustomer({
          branch_id: branchId,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
        });
      }
      onSaved(saved);
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="customer-modal">
      <form className="modal-card" onSubmit={submit}>
        <h2 className="modal-title">{customer ? "Edit customer" : "Add customer"}</h2>
        <p className="modal-note">
          {customer ? "Perubahan hanya berlaku pada data customer ini." : "Simpan customer sebagai master data cabang."}
        </p>

        <label className="field">
          <span className="field-label">Branch</span>
          <select
            value={branchId}
            disabled={Boolean(customer)}
            onChange={(e) => setBranchId(e.target.value)}
            className="select-input"
            data-testid="customer-branch-select"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code} — {branch.name}
                {!branch.is_active ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Nama customer *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="customer-name-input" />
        </label>

        <label className="field">
          <span className="field-label">Nomor HP</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" data-testid="customer-phone-input" />
        </label>

        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="customer-email-input" />
        </label>

        <label className="field">
          <span className="field-label">Alamat</span>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} data-testid="customer-address-input" />
        </label>

        <label className="field">
          <span className="field-label">Catatan</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} data-testid="customer-notes-input" />
        </label>

        {customer && (
          <label className="checkbox-field">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Customer aktif</span>
          </label>
        )}

        {error && <div className="auth-error" data-testid="customer-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button type="submit" className="btn-primary" disabled={submitting || branches.length === 0} data-testid="customer-save-button">
            {submitting ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CustomerModal;
