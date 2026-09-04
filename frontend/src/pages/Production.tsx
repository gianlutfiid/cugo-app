import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Branch, formatApiError, ProductionJob, getProductionQueue, claimProductionJob, completeProductionJob, listBranches, getOrder, getOrderHistory, Order, OrderStatusLog } from "../api/client";

const stages = [
  { key: "washing", label: "Cuci" },
  { key: "ironing", label: "Setrika" },
  { key: "folding", label: "Lipat" },
  { key: "packing", label: "Packing" },
];

const stageLabel = (value: string) => stages.find((s) => s.key === value)?.label || value;
const statusLabel: Record<string, string> = { received: "Diterima", washing: "Cuci", ironing: "Setrika", folding: "Lipat", packing: "Packing", completed: "Selesai", picked_up: "Diambil", cancelled: "Dibatalkan" };
const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const fmt = (value: string | null) => value ? new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";
const duration = (start: string | null, end: string | null) => {
  if (!start || !end) return "—";
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return `${h} jam${m ? ` ${m} menit` : ""}`;
};

const Production: React.FC = () => {
  const navigate = useNavigate();
  const [activeStage, setActiveStage] = useState("washing");
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<ProductionJob | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<OrderStatusLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = async () => {
    setLoading(true); setError(null);
    try { setJobs(await getProductionQueue(activeStage, branchId || undefined)); }
    catch (err: any) { setError(formatApiError(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const openDetail = async (job: ProductionJob) => {
    setSelectedJob(job); setOrder(null); setHistory([]); setDetailLoading(true); setError(null);
    try {
      const [o, h] = await Promise.all([getOrder(job.order_id), getOrderHistory(job.order_id)]);
      setOrder(o); setHistory(h);
    } catch (err: any) { setError(formatApiError(err.response?.data?.detail)); }
    finally { setDetailLoading(false); }
  };

  useEffect(() => { listBranches().then((b) => { setBranches(b); if (b.length === 1) setBranchId(b[0].id); }).catch(() => undefined); }, []);
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 8000); return () => window.clearInterval(timer); }, [activeStage, branchId]);

  const pending = useMemo(() => jobs.filter((j) => j.status === "pending"), [jobs]);
  const mine = useMemo(() => jobs.filter((j) => j.status === "in_progress"), [jobs]);

  const action = async (id: string, operation: () => Promise<unknown>) => {
    setBusyId(id); setError(null);
    try { await operation(); if (selectedJob?.id === id) { setSelectedJob(null); } await refresh(); }
    catch (err: any) { setError(formatApiError(err.response?.data?.detail)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="app production-page">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">CUGO</span><span className="brand-dot" /><span className="brand-sub">Produksi</span></div>
        <div className="topbar-right">
          {branches.length > 1 && <select className="select-input" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Semua cabang</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select>}
          <button className="btn-ghost" onClick={() => navigate("/")}>Dashboard</button>
        </div>
      </header>
      <main className="hero users-main production-main">
        <p className="eyebrow">Operasional Karyawan</p>
        <div className="production-title-row">
          <div><h1 className="title">Production Board</h1><p className="subtitle">Lihat pekerjaan, buka detail nota, dan telusuri seluruh riwayat aktivitas per tahap.</p></div>
          <button className="btn-primary" onClick={refresh} disabled={loading}>Refresh</button>
        </div>
        <div className="production-tabs">{stages.map((s) => <button key={s.key} className={`production-tab ${activeStage === s.key ? "active" : ""}`} onClick={() => setActiveStage(s.key)}>{s.label}</button>)}</div>
        {error && <div className="auth-error">{error}</div>}
        {loading ? <div className="spinner" /> : <div className="production-grid">
          <section className="production-column"><div className="production-column-head"><div><span>Menunggu {stageLabel(activeStage)}</span><small>Siapa saja dapat mengambil pekerjaan tersedia.</small></div><strong>{pending.length}</strong></div>{pending.length === 0 ? <div className="production-empty">Tidak ada pekerjaan menunggu.</div> : pending.map((job) => <JobCard key={job.id} job={job} busy={busyId === job.id} action={action} onDetail={openDetail} />)}</section>
          <section className="production-column"><div className="production-column-head"><div><span>Sedang dikerjakan</span><small>Daftar pekerjaan yang sudah diambil dan sedang berjalan.</small></div><strong>{mine.length}</strong></div>{mine.length === 0 ? <div className="production-empty">Belum ada pekerjaan aktif.</div> : mine.map((job) => <JobCard key={job.id} job={job} busy={busyId === job.id} action={action} onDetail={openDetail} />)}</section>
        </div>}
      </main>
      {selectedJob && <ProductionDetail job={selectedJob} order={order} history={history} loading={detailLoading} onClose={() => setSelectedJob(null)} />}
    </div>
  );
};

const JobCard: React.FC<{ job: ProductionJob; busy: boolean; action: (id: string, operation: () => Promise<unknown>) => void; onDetail: (job: ProductionJob) => void }> = ({ job, busy, action, onDetail }) => (
  <article className="production-job-card">
    <div className="production-job-top"><strong>{job.invoice_number}</strong><span className={`badge ${job.status === "in_progress" ? "badge-ok" : "badge-wait"}`}>{job.status === "in_progress" ? "Sedang dikerjakan" : "Menunggu"}</span></div>
    <div className="production-customer">{job.customer_name}</div>
    {job.assigned_user_name && <div className="production-meta">Pekerja: <strong>{job.assigned_user_name}</strong></div>}
    {job.started_at && <div className="production-meta">Mulai: {new Date(job.started_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</div>}
    <div className="production-actions">
      <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onDetail(job)}>Detail</button>
      {job.status === "pending" && <button className="btn-primary btn-sm" disabled={busy} onClick={() => action(job.id, () => claimProductionJob(job.id))}>Ambil & Mulai</button>}
      {job.status === "in_progress" && <button className="btn-primary btn-sm" disabled={busy} onClick={() => action(job.id, () => completeProductionJob(job.id))}>Tandai Selesai</button>}
    </div>
  </article>
);

const ProductionDetail: React.FC<{ job: ProductionJob; order: Order | null; history: OrderStatusLog[]; loading: boolean; onClose: () => void }> = ({ job, order, history, loading, onClose }) => (
  <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-card modal-xl production-detail-card">
      <div className="detail-head"><div><p className="eyebrow">Detail pekerjaan</p><h2 className="modal-title">{job.invoice_number}</h2><p className="muted-text">{job.customer_name} · Tahap {stageLabel(job.stage)}</p></div><button className="btn-ghost" onClick={onClose}>Tutup</button></div>
      {loading ? <div className="spinner" /> : order && <>
        <div className="production-detail-grid">
          <div><span>Status Nota</span><strong>{statusLabel[order.status] || order.status}</strong></div>
          <div><span>Status Pekerjaan</span><strong>{job.status === "in_progress" ? "Sedang dikerjakan" : "Menunggu"}</strong></div>
          <div><span>Pekerja</span><strong>{job.assigned_user_name || "Belum ada"}</strong></div>
          <div><span>Mulai</span><strong>{fmt(job.started_at)}</strong></div>
          <div><span>Selesai</span><strong>{fmt(job.completed_at)}</strong></div>
          <div><span>Durasi</span><strong>{duration(job.started_at, job.completed_at)}</strong></div>
          <div><span>Diterima</span><strong>{fmt(order.received_at)}</strong></div>
          <div><span>Jatuh Tempo</span><strong>{fmt(order.due_at)}</strong></div>
        </div>
        <div><h3 className="section-title">Item Nota</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>Layanan</th><th>Qty</th><th>Harga</th><th>Subtotal</th><th>Catatan</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td>{item.service_name}</td><td>{Number(item.quantity).toLocaleString("id-ID")} {item.unit}</td><td>{rupiah(item.unit_price)}</td><td>{rupiah(item.subtotal)}</td><td>{item.notes || "—"}</td></tr>)}</tbody></table></div></div>
        <div className="production-order-total"><span>Total Nota</span><strong>{rupiah(order.total)}</strong></div>
        <div><h3 className="section-title">Riwayat Aktivitas Nota</h3>{history.length === 0 ? <div className="production-empty">Belum ada riwayat.</div> : <div className="activity-timeline">{history.map((entry) => <div className="activity-item" key={entry.id}><div className="activity-dot" /><div className="activity-content"><div className="activity-main"><strong>{entry.from_status ? `${statusLabel[entry.from_status] || entry.from_status} → ` : ""}{statusLabel[entry.to_status] || entry.to_status}</strong><span>{fmt(entry.changed_at)}</span></div><div className="activity-meta">Oleh: {entry.changed_by_name || "User"}{entry.note ? ` · ${entry.note}` : ""}</div></div></div>)}</div>}</div>
      </>}
    </div>
  </div>
);

export default Production;
