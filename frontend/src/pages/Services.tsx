import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  Branch,
  createService,
  createServiceCategory,
  formatApiError,
  listBranches,
  listServiceCategories,
  listServices,
  ServiceCategory,
  ServiceItem,
  updateService,
  updateServiceCategory,
} from "../api/client";

const unitLabels: Record<string, string> = {
  kg: "Kg",
  pcs: "Pcs",
  pasang: "Pasang",
  set: "Set",
};

const roleForBranch = (user: ReturnType<typeof useAuth>["user"], branchId: string): string | null => {
  if (!user) return null;
  if (user.is_superadmin) return "super_admin";
  return user.memberships.find((m) => m.branch_id === branchId)?.role ?? null;
};

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);

const Services: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"category" | "service" | null>(null);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  const canManage = useMemo(() => {
    if (!branchId) return false;
    const role = roleForBranch(user, branchId);
    return role === "super_admin" || role === "branch_admin";
  }, [branchId, user]);

  const load = async () => {
    setError(null);
    try {
      const [cats, svcs] = await Promise.all([
        listServiceCategories(branchId || undefined),
        listServices({ branch_id: branchId || undefined, category_id: categoryId || undefined, include_inactive: includeInactive }),
      ]);
      setCategories(cats);
      setServices(svcs);
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    listBranches()
      .then((b) => {
        setBranches(b);
        if (b.length === 1) setBranchId(b[0].id);
      })
      .catch((err) => setError(formatApiError(err.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!branches.length) return;
    load();
  }, [branchId, categoryId, includeInactive]);

  const branchName = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return b ? `${b.code} — ${b.name}` : "—";
  };

  return (
    <div className="app" data-testid="services-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CUGO</span>
          <span className="brand-dot" />
          <span className="brand-sub">App</span>
        </div>
        <div className="topbar-right">
          <button className="btn-ghost" onClick={() => navigate("/")}>Dashboard</button>
          {canManage && <button className="btn-primary" onClick={() => { setEditingService(null); setModal("service"); }}>Add service</button>}
        </div>
      </header>

      <main className="hero users-main">
        <p className="eyebrow">Master Data</p>
        <h1 className="title">Services &amp; Pricing</h1>
        <p className="subtitle">Kelola kategori layanan dan harga layanan per cabang untuk kebutuhan transaksi laundry.</p>

        <div className="toolbar">
          <select className="select-input toolbar-select" value={branchId} onChange={(e) => { setBranchId(e.target.value); setCategoryId(""); }} data-testid="service-branch-filter">
            <option value="">Semua cabang yang bisa diakses</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
          <select className="select-input toolbar-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid="service-category-filter">
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
          <label className="checkbox-field toolbar-check">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            <span>Tampilkan nonaktif</span>
          </label>
          {canManage && <button className="btn-ghost" onClick={() => { setEditingCategory(null); setModal("category"); }}>Manage category</button>}
        </div>

        {error && <div className="auth-error" data-testid="services-error">{error}</div>}

        <section className="master-section">
          <div className="section-head">
            <div>
              <h2>Kategori layanan</h2>
              <p className="muted">Contoh: Kiloan, Satuan, Bedding, Sepatu, Baby &amp; Kids.</p>
            </div>
            {canManage && <button className="btn-link" onClick={() => { setEditingCategory(null); setModal("category"); }}>+ Tambah kategori</button>}
          </div>
          <div className="category-grid">
            {categories.length === 0 ? <div className="empty-card">Belum ada kategori untuk cabang ini.</div> : categories.map((category) => (
              <button key={category.id} className={`category-card ${categoryId === category.id ? "category-card-active" : ""}`} onClick={() => setCategoryId(category.id)}>
                <span className="category-code">{category.code}</span>
                <strong>{category.name}</strong>
                <span className={`badge ${category.is_active ? "badge-ok" : "badge-down"}`}>{category.is_active ? "Active" : "Inactive"}</span>
                {canManage && <span className="category-edit" onClick={(e) => { e.stopPropagation(); setEditingCategory(category); setModal("category"); }}>Edit</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="master-section">
          <div className="section-head">
            <div>
              <h2>Daftar layanan</h2>
              <p className="muted">Harga disimpan dalam Rupiah dan siap dipakai saat membuat nota.</p>
            </div>
          </div>
          {loading ? <div className="spinner" /> : (
            <div className="table-wrap">
              <table className="data-table" data-testid="services-table">
                <thead><tr><th>Kode</th><th>Nama layanan</th><th>Kategori</th><th>Unit</th><th>Harga</th><th>Cabang</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {services.length === 0 ? <tr><td colSpan={8} className="empty-cell">Belum ada layanan.</td></tr> : services.map((service) => (
                    <tr key={service.id}>
                      <td><strong>{service.code}</strong></td>
                      <td>{service.name}</td>
                      <td>{service.category_code} — {service.category_name}</td>
                      <td>{unitLabels[service.unit] || service.unit}</td>
                      <td>Rp {rupiah(service.price)}</td>
                      <td>{branchName(service.branch_id)}</td>
                      <td><span className={`badge ${service.is_active ? "badge-ok" : "badge-down"}`}>{service.is_active ? "Active" : "Inactive"}</span></td>
                      <td>{canManage && <button className="btn-ghost btn-sm" onClick={() => { setEditingService(service); setModal("service"); }}>Edit</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {modal === "category" && <CategoryModal branchId={branchId} category={editingCategory} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal === "service" && <ServiceModal branchId={branchId} categories={categories} service={editingService} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
};

const CategoryModal: React.FC<{
  branchId: string;
  category: ServiceCategory | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ branchId, category, onClose, onSaved }) => {
  const [name, setName] = useState(category?.name ?? "");
  const [code, setCode] = useState(category?.code ?? "");
  const [active, setActive] = useState(category?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!branchId) return setError("Pilih cabang terlebih dahulu.");
    if (!name.trim() || !code.trim()) return setError("Nama dan kode kategori wajib diisi.");
    setSaving(true);
    try {
      if (category) await updateServiceCategory(category.id, { name: name.trim(), code: code.trim().toUpperCase(), is_active: active });
      else await createServiceCategory({ branch_id: branchId, name: name.trim(), code: code.trim().toUpperCase() });
      onSaved();
    } catch (err: any) { setError(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };
  return <div className="modal-overlay"><form className="modal-card modal-sm" onSubmit={submit}><h2 className="modal-title">{category ? "Edit kategori" : "Tambah kategori"}</h2><label className="field"><span className="field-label">Nama kategori</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kiloan" /></label><label className="field"><span className="field-label">Kode</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="KILO" /></label>{category && <label className="checkbox-field"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Aktif</span></label>}{error && <div className="auth-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn-ghost" onClick={onClose}>Batal</button><button className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</button></div></form></div>;
};

const ServiceModal: React.FC<{
  branchId: string;
  categories: ServiceCategory[];
  service: ServiceItem | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ branchId, categories, service, onClose, onSaved }) => {
  const [categoryId, setCategoryId] = useState(service?.category_id ?? categories.find((c) => c.is_active)?.id ?? "");
  const [name, setName] = useState(service?.name ?? "");
  const [code, setCode] = useState(service?.code ?? "");
  const [unit, setUnit] = useState(service?.unit ?? "kg");
  const [price, setPrice] = useState(service?.price?.toString() ?? "");
  const [active, setActive] = useState(service?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!branchId || !categoryId || !name.trim() || !code.trim() || !unit.trim()) return setError("Cabang, kategori, nama, kode, dan unit wajib diisi.");
    const numericPrice = Number(price);
    if (!Number.isInteger(numericPrice) || numericPrice < 0) return setError("Harga harus berupa angka Rupiah yang valid.");
    setSaving(true);
    try {
      if (service) await updateService(service.id, { category_id: categoryId, name: name.trim(), code: code.trim().toUpperCase(), unit: unit.trim(), price: numericPrice, is_active: active });
      else await createService({ branch_id: branchId, category_id: categoryId, name: name.trim(), code: code.trim().toUpperCase(), unit: unit.trim(), price: numericPrice });
      onSaved();
    } catch (err: any) { setError(formatApiError(err.response?.data?.detail)); }
    finally { setSaving(false); }
  };
  return <div className="modal-overlay"><form className="modal-card" onSubmit={submit}><h2 className="modal-title">{service ? "Edit layanan" : "Tambah layanan"}</h2><label className="field"><span className="field-label">Kategori</span><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.filter((c) => c.is_active || c.id === categoryId).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label><label className="field"><span className="field-label">Nama layanan</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cuci Kiloan Regular" /></label><label className="field"><span className="field-label">Kode layanan</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="KILO-REG" /></label><div className="form-grid"><label className="field"><span className="field-label">Unit</span><select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="kg">Kg</option><option value="pcs">Pcs</option><option value="pasang">Pasang</option><option value="set">Set</option></select></label><label className="field"><span className="field-label">Harga (Rp)</span><input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="10000" /></label></div>{service && <label className="checkbox-field"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Aktif</span></label>}{error && <div className="auth-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn-ghost" onClick={onClose}>Batal</button><button className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</button></div></form></div>;
};

export default Services;
