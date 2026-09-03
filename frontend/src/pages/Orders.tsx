import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Branch,
  Customer,
  createOrder,
  formatApiError,
  listBranches,
  listCustomers,
  listOrders,
  listServices,
  OrderListItem,
  ServiceItem,
} from "../api/client";

interface DraftItem {
  service_id: string;
  quantity: number;
  notes: string;
}

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

const Orders: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setOrders(await listOrders({ branch_id: branchId || undefined, q: search.trim() || undefined, order_status: status || undefined, payment_status: paymentStatus || undefined }));
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([listBranches(), listCustomers(), listServices(), listOrders()])
      .then(([b, c, s, o]) => {
        setBranches(b);
        setCustomers(c);
        setServices(s);
        setOrders(o);
        if (b.length === 1) setBranchId(b[0].id);
      })
      .catch((err) => setError(formatApiError(err.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 250);
    return () => window.clearTimeout(timer);
  }, [branchId, search, status, paymentStatus]);

  const activeBranches = branches.filter((b) => b.is_active);

  return (
    <div className="app" data-testid="orders-page">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">CUGO</span><span className="brand-dot" /><span className="brand-sub">App</span></div>
        <div className="topbar-right">
          <button className="btn-ghost" onClick={() => navigate("/")}>Dashboard</button>
          <button className="btn-primary" onClick={() => setShowCreate(true)} disabled={activeBranches.length === 0}>Buat Nota</button>
        </div>
      </header>
      <main className="hero users-main">
        <p className="eyebrow">Operasional</p>
        <h1 className="title">Transaksi</h1>
        <p className="subtitle">Buat nota laundry, pilih layanan, simpan catatan barang, dan catat pembayaran.</p>
        <div className="toolbar">
          <input className="search-input" placeholder="Cari no. nota, nama, atau nomor HP…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select-input toolbar-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Semua cabang yang bisa diakses</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
          <select className="select-input toolbar-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua status</option>
            <option value="received">Diterima</option>
            <option value="washing">Cuci</option>
            <option value="ironing">Setrika</option>
            <option value="folding">Lipat</option>
            <option value="packing">Packing</option>
            <option value="completed">Selesai</option>
            <option value="picked_up">Diambil</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
          <select className="select-input toolbar-select" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="">Semua pembayaran</option>
            <option value="unpaid">Belum bayar</option>
            <option value="partial">Sebagian</option>
            <option value="paid">Lunas</option>
          </select>
        </div>
        {error && <div className="auth-error">{error}</div>}
        {loading ? <div className="spinner" /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>No. Nota</th><th>Customer</th><th>Diterima</th><th>Jatuh tempo</th><th>Status</th><th>Total</th><th>Bayar</th></tr></thead>
              <tbody>
                {orders.length === 0 ? <tr><td colSpan={7} className="empty-cell">Belum ada transaksi.</td></tr> : orders.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.invoice_number}</strong></td>
                    <td>{o.customer_name}</td>
                    <td>{new Date(o.received_at).toLocaleString("id-ID")}</td>
                    <td>{o.due_at ? new Date(o.due_at).toLocaleString("id-ID") : "—"}</td>
                    <td><span className="badge badge-ok">{o.status}</span></td>
                    <td>{rupiah(o.total)}</td>
                    <td><span className={`badge ${o.payment_status === "paid" ? "badge-ok" : "badge-wait"}`}>{o.payment_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {showCreate && <CreateOrderModal branches={activeBranches} customers={customers.filter((c) => c.is_active)} services={services} defaultBranchId={branchId} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh(); }} />}
    </div>
  );
};

interface CreateOrderModalProps {
  branches: Branch[];
  customers: Customer[];
  services: ServiceItem[];
  defaultBranchId: string;
  onClose: () => void;
  onCreated: () => void;
}

const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ branches, customers, services, defaultBranchId, onClose, onCreated }) => {
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "");
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ service_id: services[0]?.id || "", quantity: 1, notes: "" }]);
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const branchCustomers = useMemo(() => customers.filter((c) => c.branch_id === branchId), [customers, branchId]);
  const branchServices = useMemo(() => services.filter((s) => s.branch_id === branchId && s.is_active), [services, branchId]);
  const subtotal = items.reduce((sum, item) => {
    const service = branchServices.find((s) => s.id === item.service_id);
    return sum + (service ? Math.round(service.price * item.quantity) : 0);
  }, 0);
  const total = Math.max(0, subtotal - discount);
  const change = Math.max(0, paidAmount - total);

  useEffect(() => {
    setCustomerId(branchCustomers[0]?.id || "");
    setItems((current) => current.map((item, index) => ({ ...item, service_id: branchServices[index]?.id || branchServices[0]?.id || "" })));
  }, [branchId]);

  useEffect(() => {
    setItems((current) => current.map((item) => branchServices.some((s) => s.id === item.service_id) ? item : { ...item, service_id: branchServices[0]?.id || "" }));
  }, [services]);

  const addItem = () => setItems((current) => [...current, { service_id: branchServices[0]?.id || "", quantity: 1, notes: "" }]);
  const updateItem = (index: number, patch: Partial<DraftItem>) => setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const removeItem = (index: number) => setItems((current) => current.filter((_, i) => i !== index));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!branchId || !customerId || items.length === 0 || items.some((i) => !i.service_id || i.quantity <= 0)) {
      setError("Cabang, customer, dan minimal satu layanan wajib diisi.");
      return;
    }
    if (discount > subtotal || paidAmount > total) {
      setError("Diskon atau pembayaran melebihi nilai transaksi.");
      return;
    }
    setSubmitting(true);
    try {
      await createOrder({
        branch_id: branchId,
        customer_id: customerId,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        discount,
        paid_amount: paidAmount,
        payment_method: paidAmount > 0 ? paymentMethod : null,
        notes: notes.trim() || null,
        items: items.map((i) => ({ service_id: i.service_id, quantity: i.quantity, notes: i.notes.trim() || null })),
      });
      onCreated();
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal-card modal-lg" onSubmit={submit}>
        <h2 className="modal-title">Buat Nota Laundry</h2>
        <div className="form-grid-two">
          <label className="field"><span className="field-label">Cabang</span><select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Pilih cabang</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label>
          <label className="field"><span className="field-label">Customer</span><select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Pilih customer</option>{branchCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}</select></label>
          <label className="field"><span className="field-label">Jatuh tempo</span><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
        </div>
        <div className="order-items-head"><span className="field-label">Layanan</span><button type="button" className="btn-link" onClick={addItem} disabled={!branchServices.length}>+ Tambah layanan</button></div>
        {items.map((item, index) => {
          const service = branchServices.find((s) => s.id === item.service_id);
          return <div className="order-item-row" key={index}>
            <select value={item.service_id} onChange={(e) => updateItem(index, { service_id: e.target.value })}>{branchServices.map((s) => <option key={s.id} value={s.id}>{s.category_code} · {s.name} — {rupiah(s.price)}/{s.unit}</option>)}</select>
            <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} />
            <input placeholder="Catatan barang" value={item.notes} onChange={(e) => updateItem(index, { notes: e.target.value })} />
            <strong>{rupiah(service ? Math.round(service.price * item.quantity) : 0)}</strong>
            <button type="button" className="btn-remove" onClick={() => removeItem(index)} disabled={items.length === 1}>×</button>
          </div>;
        })}
        <div className="form-grid-two">
          <label className="field"><span className="field-label">Diskon</span><input type="number" min="0" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} /></label>
          <label className="field"><span className="field-label">Bayar</span><input type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value)))} /></label>
          <label className="field"><span className="field-label">Metode pembayaran</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={paidAmount === 0}><option value="cash">Cash</option><option value="qris">QRIS</option><option value="transfer">Transfer</option><option value="other">Lainnya</option></select></label>
          <label className="field"><span className="field-label">Catatan nota</span><textarea className="textarea-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan umum nota…" /></label>
        </div>
        <div className="order-summary"><span>Subtotal <strong>{rupiah(subtotal)}</strong></span><span>Diskon <strong>{rupiah(discount)}</strong></span><span>Total <strong>{rupiah(total)}</strong></span><span>Kembalian <strong>{rupiah(change)}</strong></span></div>
        {error && <div className="auth-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn-ghost" onClick={onClose}>Batal</button><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Menyimpan…" : "Simpan Nota"}</button></div>
      </form>
    </div>
  );
};

export default Orders;
