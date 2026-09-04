import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Branch, formatApiError, ProductionJob, getProductionQueue, claimProductionJob, completeProductionJob, listBranches } from "../api/client";

const stages = [
  { key: "washing", label: "Cuci" },
  { key: "ironing", label: "Setrika" },
  { key: "folding", label: "Lipat" },
  { key: "packing", label: "Packing" },
];

const Production: React.FC = () => {
  const navigate = useNavigate();
  const [activeStage, setActiveStage] = useState("washing");
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true); setError(null);
    try { setJobs(await getProductionQueue(activeStage, branchId || undefined)); }
    catch (err: any) { setError(formatApiError(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  useEffect(() => { listBranches().then((b) => { setBranches(b); if (b.length === 1) setBranchId(b[0].id); }).catch(() => undefined); }, []);
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 8000); return () => window.clearInterval(timer); }, [activeStage, branchId]);

  const pending = useMemo(() => jobs.filter((j) => j.status === "pending"), [jobs]);
  const mine = useMemo(() => jobs.filter((j) => j.status === "in_progress"), [jobs]);

  const action = async (id: string, operation: () => Promise<unknown>) => {
    setBusyId(id); setError(null);
    try { await operation(); await refresh(); }
    catch (err: any) { setError(formatApiError(err.response?.data?.detail)); }
    finally { setBusyId(null); }
  };

  const formatTime = (value: string | null) => value ? new Date(value).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "—";
  const stageLabel = stages.find((s) => s.key === activeStage)?.label || activeStage;

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
          <div><h1 className="title">Production Board</h1><p className="subtitle">Kelola pekerjaan laundry berdasarkan tahap. Tombol Ambil langsung memulai pencatatan waktu kerja.</p></div>
          <button className="btn-primary" onClick={refresh} disabled={loading}>Refresh</button>
        </div>
        <div className="production-tabs">{stages.map((s) => <button key={s.key} className={`production-tab ${activeStage === s.key ? "active" : ""}`} onClick={() => setActiveStage(s.key)}>{s.label}</button>)}</div>
        {error && <div className="auth-error">{error}</div>}
        {loading ? <div className="spinner" /> : <div className="production-grid">
          <section className="production-column"><div className="production-column-head"><div><span>Menunggu {stageLabel}</span><small>Siapa saja dapat mengambil pekerjaan tersedia.</small></div><strong>{pending.length}</strong></div>{pending.length === 0 ? <div className="production-empty">Tidak ada pekerjaan menunggu.</div> : pending.map((job) => <JobCard key={job.id} job={job} busy={busyId === job.id} action={action} formatTime={formatTime} />)}</section>
          <section className="production-column"><div className="production-column-head"><div><span>Sedang dikerjakan</span><small>Daftar pekerjaan yang sudah diambil dan sedang berjalan.</small></div><strong>{mine.length}</strong></div>{mine.length === 0 ? <div className="production-empty">Belum ada pekerjaan aktif.</div> : mine.map((job) => <JobCard key={job.id} job={job} busy={busyId === job.id} action={action} formatTime={formatTime} />)}</section>
        </div>}
      </main>
    </div>
  );
};

const JobCard: React.FC<{ job: ProductionJob; busy: boolean; action: (id: string, operation: () => Promise<unknown>) => void; formatTime: (value: string | null) => string }> = ({ job, busy, action, formatTime }) => (
  <article className="production-job-card">
    <div className="production-job-top"><strong>{job.invoice_number}</strong><span className={`badge ${job.status === "in_progress" ? "badge-ok" : "badge-wait"}`}>{job.status === "in_progress" ? "Sedang dikerjakan" : "Menunggu"}</span></div>
    <div className="production-customer">{job.customer_name}</div>
    {job.assigned_user_name && <div className="production-meta">Pekerja: <strong>{job.assigned_user_name}</strong></div>}
    {job.started_at && <div className="production-meta">Mulai: {formatTime(job.started_at)}</div>}
    <div className="production-actions">
      {job.status === "pending" && <button className="btn-primary btn-sm" disabled={busy} onClick={() => action(job.id, () => claimProductionJob(job.id))}>Ambil & Mulai</button>}
      {job.status === "in_progress" && <button className="btn-primary btn-sm" disabled={busy} onClick={() => action(job.id, () => completeProductionJob(job.id))}>Tandai Selesai</button>}
    </div>
  </article>
);

export default Production;
