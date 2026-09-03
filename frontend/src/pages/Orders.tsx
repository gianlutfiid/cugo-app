import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Branch,
  Customer,
  createOrder,
  formatApiError,
  getOrder,
  listBranches,
  listCustomers,
  listOrders,
  listServices,
  Order,
  OrderListItem,
  ServiceItem,
  updateOrder,
} from "../api/client";

interface DraftItem {
  service_id: string;
  quantity: number;
  notes: string;
}

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

const statusLabels: Record<string, string> = {
  received: "Diterima",
  washing: "Cuci",
  ironing: "Setrika",
  folding: "Lipat",
  packing: "Packing",
  completed: "Selesai",
  picked_up: "Diambil",
  cancelled: "Dibatalkan",
};

const paymentLabels: Record<string, string> = {
  unpaid: "Belum bayar",
  partial: "Sebagian",
  paid: "Lunas",
};

const nextStatuses: Record<string, string[]> = {
  received: ["washing", "cancelled"],
  washing: ["ironing", "cancelled"],
  ironing: ["folding", "cancelled"],
  folding: ["packing", "cancelled"],
  packing: ["completed", "cancelled"],
  completed: ["picked_up"],
  picked_up: [],
  cancelled: [],
};

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
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const openDetail = async (orderId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      setSelectedOrder(await getOrder(orderId));
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setDetailLoading(false);
    }
  };

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
        <p className="subtitle">Buat nota laundry, cek detail barang, catat pembayaran, dan jalankan status proses secara berurutan.</p>
        <div className="toolbar">
          <input className="search-input" placeholder="Cari no. nota, nama, atau nomor HP…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select-input toolbar-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Semua cabang yang bisa diakses</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
          <select className="select-input toolbar-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua status</option>
            {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select className="select-input toolbar-select" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="">Semua pembayaran</option>
            {Object.entries(paymentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        {error && <div className="auth-error">{error}</div>}
        {loading ? <div className="spinner" /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>No. Nota</th><th>Customer</th><th>Diterima</th><th>Jatuh tempo</th><th>Status</th><th>Total</th><th>Bayar</th><th>Aksi</th></tr></thead>
              <tbody>
                {orders.length === 0 ? <tr><td colSpan={8} className="empty-cell">Belum ada transaksi.</td></tr> : orders.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.invoice_number}</strong></td>
                    <td>{o.customer_name}</td>
                    <td>{new Date(o.received_at).toLocaleString("id-ID")}</td>
                    <td>{o.due_at ? new Date(o.due_at).toLocaleString("id-ID") : "—"}</td>
                    <td><span className={`badge ${o.status === "cancelled" ? "badge-down" : o.status === "completed" || o.status === "picked_up" ? "badge-ok" : "badge-wait"}`}>{statusLabels[o.status] || o.status}</span></td>
                    <td>{rupiah(o.total)}</td>
                    <td><span className={`badge ${o.payment_status === "paid" ? "badge-ok" : "badge-wait"}`}>{paymentLabels[o.payment_status] || o.payment_status}</span></td>
                    <td><button className="btn-ghost btn-sm" onClick={() => openDetail(o.id)}>Detail</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {showCreate && <CreateOrderModal branches={activeBranches} customers={customers.filter((c) => c.is_active)} services={services} defaultBranchId={branchId} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh(); }} />}
      {detailLoading && <div className="modal-overlay"><div className="modal-card"><div className="spinner" /></div></div>}
      {selectedOrder && <OrderDetailModal order={selectedOrder} branch={branches.find((b) => b.id === selectedOrder.branch_id)} onClose={() => setSelectedOrder(null)} onUpdated={(order) => { setSelectedOrder(order); refresh(); }} />}
    </div>
  );
};

const OrderDetailModal: React.FC<{ order: Order; branch?: Branch; onClose: () => void; onUpdated: (order: Order) => void }> = ({ order, branch, onClose, onUpdated }) => {
  const [editDiscount, setEditDiscount] = useState(order.discount);
  const [editPaid, setEditPaid] = useState(order.paid_amount);
  const [editPayment, setEditPayment] = useState(order.payment_method || "cash");
  const [editDueAt, setEditDueAt] = useState(order.due_at ? new Date(order.due_at).toISOString().slice(0, 16) : "");
  const [editNotes, setEditNotes] = useState(order.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClosed = ["picked_up", "cancelled"].includes(order.status);
  const availableNext = nextStatuses[order.status] || [];
  const total = Math.max(0, order.subtotal - editDiscount);
  const change = Math.max(0, editPaid - total);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrder(order.id, {
        discount: editDiscount,
        paid_amount: editPaid,
        payment_method: editPaid > 0 ? editPayment : null,
        due_at: editDueAt ? new Date(editDueAt).toISOString() : null,
        notes: editNotes.trim() || null,
      });
      onUpdated(updated);
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const moveStatus = async (nextStatus: string) => {
    if (nextStatus === "cancelled" && !window.confirm("Batalkan nota ini? Setelah dibatalkan, nota tidak dapat diedit lagi.")) return;
    setSaving(true);
    setError(null);
    try {
      onUpdated(await updateOrder(order.id, { status: nextStatus }));
    } catch (err: any) {
      setError(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const print = () => {
    const branchName = branch ? `${branch.code} — ${branch.name}` : "CUGO";
    const items = order.items.map((item) => `<tr><td>${item.service_name}${item.notes ? `<br><small>${item.notes}</small>` : ""}</td><td>${item.quantity} ${item.unit}</td><td>${rupiah(item.unit_price)}</td><td>${rupiah(item.subtotal)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${order.invoice_number}</title><style>body{font-family:Arial,sans-serif;color:#0D2340;max-width:760px;margin:32px auto;padding:0 24px}h1{font-size:24px;margin:0 0 4px}.muted{color:#667085;font-size:12px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #0D2340;padding-bottom:16px;margin-bottom:18px}.meta{text-align:right;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;padding:9px 6px;border-bottom:1px solid #ddd;font-size:12px}th{font-size:11px;text-transform:uppercase}.totals{margin:18px 0 0 auto;max-width:320px}.totals div{display:flex;justify-content:space-between;padding:5px 0;font-size:12px}.totals .grand{font-weight:800;font-size:15px;border-top:2px solid #0D2340;padding-top:8px}.notes{margin-top:20px;padding-top:12px;border-top:1px solid #ddd;font-size:12px}.footer{margin-top:30px;text-align:center;font-size:11px;color:#667085}@media print{body{margin:0;max-width:none}}</style></head><body><header><div><h1>CUGO</h1><div class="muted">${branchName}</div></div><div class="meta"><strong>${order.invoice_number}</strong><br>Diterima: ${new Date(order.received_at).toLocaleString("id-ID")}<br>Jatuh tempo: ${order.due_at ? new Date(order.due_at).toLocaleString("id-ID") : "-"}</div></header><div><strong>${order.customer_name}</strong>${order.customer_phone ? `<div class="muted">${order.customer_phone}</div>` : ""}</div><table><thead><tr><th>Layanan</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>${items}</tbody></table><div class="totals"><div><span>Subtotal</span><strong>${rupiah(order.subtotal)}</strong></div><div><span>Diskon</span><strong>${rupiah(order.discount)}</strong></div><div class="grand"><span>Total</span><strong>${rupiah(order.total)}</strong></div><div><span>Terbayar</span><strong>${rupiah(order.paid_amount)}</strong></div><div><span>Status pembayaran</span><strong>${paymentLabels[order.payment_status]}</strong></div></div>${order.notes ? `<div class="notes"><strong>Catatan:</strong><br>${order.notes}</div>` : ""}<div class="footer">Terima kasih telah menggunakan layanan CUGO.</div></body></html>`;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-lg order-detail-card">
        <div className="detail-head"><div><p className="eyebrow">Nota</p><h2 className="modal-title">{order.invoice_number}</h2><p className="muted-text">{order.customer_name}{order.customer_phone ? ` · ${order.customer_phone}` : ""}</p></div><button className="btn-ghost" onClick={onClose}>Tutup</button></div>
        <div className="detail-meta-grid"><div><span className="field-label">Cabang</span><strong>{branch ? `${branch.code} — ${branch.name}` : "—"}</strong></div><div><span className="field-label">Diterima</span><strong>{new Date(order.received_at).toLocaleString("id-ID")}</strong></div><div><span className="field-label">Jatuh tempo</span><strong>{order.due_at ? new Date(order.due_at).toLocaleString("id-ID") : "—"}</strong></div><div><span className="field-label">Status</span><strong>{statusLabels[order.status] || order.status}</strong></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Layanan</th><th>Qty</th><th>Harga</th><th>Subtotal</th><th>Catatan</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td><strong>{item.service_name}</strong><div className="muted-text">{item.service_code}</div></td><td>{item.quantity} {item.unit}</td><td>{rupiah(item.unit_price)}</td><td>{rupiah(item.subtotal)}</td><td>{item.notes || "—"}</td></tr>)}</tbody></table></div>
        <div className="detail-summary"><div><span>Subtotal</span><strong>{rupiah(order.subtotal)}</strong></div><div><span>Diskon</span><strong>{rupiah(order.discount)}</strong></div><div><span>Total</span><strong>{rupiah(order.total)}</strong></div><div><span>Terbayar</span><strong>{rupiah(order.paid_amount)}</strong></div><div><span>Pembayaran</span><strong>{paymentLabels[order.payment_status]}{order.payment_method ? ` · ${order.payment_method.toUpperCase()}` : ""}</strong></div></div>
        {!isClosed && <><div className="detail-edit-grid"><label className="field"><span className="field-label">Diskon</span><input type="number" min="0" value={editDiscount} onChange={(e) => setEditDiscount(Math.max(0, Number(e.target.value)))} /></label><label className="field"><span className="field-label">Bayar</span><input type="number" min="0" value={editPaid} onChange={(e) => setEditPaid(Math.max(0, Number(e.target.value)))} /></label><label className="field"><span className="field-label">Metode pembayaran</span><select value={editPayment} onChange={(e) => setEditPayment(e.target.value)} disabled={editPaid === 0}><option value="cash">Cash</option><option value="qris">QRIS</option><option value="transfer">Transfer</option><option value="other">Lainnya</option></select></label><label className="field"><span className="field-label">Jatuh tempo</span><input type="datetime-local" value={editDueAt} onChange={(e) => setEditDueAt(e.target.value)} /></label><label className="field detail-note-field"><span className="field-label">Catatan nota</span><textarea className="textarea-input" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></label></div><div className="order-summary"><span>Total baru <strong>{rupiah(total)}</strong></span><span>Kembalian <strong>{rupiah(change)}</strong></span></div></>}
        {error && <div className="auth-error">{error}</div>}
        <div className="status-actions"><span className="field-label">Lanjut proses:</span>{availableNext.map((next) => <button key={next} className={next === "cancelled" ? "btn-danger" : "btn-primary"} onClick={() => moveStatus(next)} disabled={saving}>{statusLabels[next]}</button>)}</div>
        <div className="modal-actions"><button type="button" className="btn-ghost" onClick={print}>Preview / Cetak Nota</button>{!isClosed && <button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? "Menyimpan…" : "Simpan Perubahan"}</button>}</div>
      </div>
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
