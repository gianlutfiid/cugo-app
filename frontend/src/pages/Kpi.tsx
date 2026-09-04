import React, { useEffect, useState } from "react";
import { Branch, formatApiError, getProductionKpi, listBranches, ProductionKpi } from "../api/client";

const today = new Date();
const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

const Kpi: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState(toDateInput(monthStart));
  const [endDate, setEndDate] = useState(toDateInput(today));
  const [data, setData] = useState<ProductionKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!startDate || !endDate) return;
    setLoading(true); setError(null);
    try { setData(await getProductionKpi({ start_date: startDate, end_date: endDate, branch_id: branchId || undefined })); }
    catch (err: any) { setError(formatApiError(err.response?.data?.detail)); setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { listBranches().then((b) => { setBranches(b); if (b.length === 1) setBranchId(b[0].id); }).catch((err: any) => setError(formatApiError(err.response?.data?.detail))); }, []);
  useEffect(() => { load(); }, [startDate, endDate, branchId]);

  const fmtDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} mnt`;
    const h = Math.floor(minutes / 60); const m = minutes % 60;
    return m ? `${h}j ${m}mnt` : `${h}j`;
  };
  const fmtQty = (quantity: number) => Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  const fmtDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const stages = ["washing", "ironing", "folding", "packing"];
  const stageLabels: Record<string, string> = { washing: "Cuci", ironing: "Setrika", folding: "Lipat", packing: "Packing" };
  const units = Object.keys(data?.summary.quantity_by_unit || {}).sort();

  return (
    <div className="app" data-testid="kpi-page">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">CUGO</span><span className="brand-dot" /><span className="brand-sub">KPI</span></div>
        <div className="topbar-right"><button className="btn-ghost" onClick={() => window.history.back()}>Kembali</button></div>
      </header>
      <main className="hero users-main kpi-main">
        <p className="eyebrow">Performa Karyawan</p>
        <div className="kpi-title-row"><div><h1 className="title">KPI Produksi</h1><p className="subtitle">Produktivitas dihitung dari pekerjaan produksi yang benar-benar diselesaikan pada periode yang dipilih.</p></div><button className="btn-primary" onClick={load} disabled={loading}>Refresh</button></div>
        <div className="kpi-filters">
          <label className="field"><span className="field-label">Mulai</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label className="field"><span className="field-label">Sampai</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          {branches.length > 1 && <label className="field"><span className="field-label">Cabang</span><select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Semua cabang yang bisa diakses</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label>}
        </div>
        {error && <div className="auth-error">{error}</div>}
        {loading ? <div className="spinner" /> : data && <>
          <div className="kpi-period">Periode: <strong>{fmtDate(data.summary.period_start)}</strong> — <strong>{fmtDate(data.summary.period_end)}</strong></div>
          <section className="kpi-summary-grid">
            <div className="kpi-stat"><span>Job selesai</span><strong>{data.summary.completed_jobs}</strong></div>
            <div className="kpi-stat"><span>Job aktif</span><strong>{data.summary.active_jobs}</strong></div>
            <div className="kpi-stat"><span>Total durasi</span><strong>{fmtDuration(data.summary.total_duration_minutes)}</strong></div>
            <div className="kpi-stat"><span>Rata-rata / job</span><strong>{fmtDuration(Math.round(data.summary.average_duration_minutes))}</strong></div>
            <div className="kpi-stat"><span>Karyawan aktif</span><strong>{data.summary.employees_count}</strong></div>
          </section>
          {units.length > 0 && <section className="kpi-ranking-card"><div className="kpi-section-head"><div><h2>Output Produksi</h2><p>Total kuantitas dari job yang selesai pada periode ini.</p></div></div><div className="kpi-summary-quantity">{units.map((unit) => <div className="kpi-stat" key={unit}><span>{unit}</span><strong>{fmtQty(data.summary.quantity_by_unit[unit])}</strong></div>)}</div></section>}
          <section className="kpi-ranking-card">
            <div className="kpi-section-head"><div><h2>Peringkat Produktivitas</h2><p>Urutan berdasarkan jumlah job selesai, lalu rata-rata durasi.</p></div></div>
            <div className="table-wrap"><table className="data-table kpi-table"><thead><tr><th>#</th><th>Karyawan</th><th>Hari Aktif</th><th>Selesai</th><th>Aktif</th><th>Total Durasi</th><th>Rata-rata</th>{stages.map((s) => <th key={s}>{stageLabels[s]}</th>)}</tr></thead><tbody>
              {data.employees.length === 0 ? <tr><td colSpan={11} className="empty-cell">Belum ada data produksi pada periode ini.</td></tr> : data.employees.map((e, i) => <tr key={e.user_id}>
                <td><strong>{i + 1}</strong></td><td><strong>{e.employee_name}</strong></td><td>{e.active_days}</td><td>{e.completed_jobs}</td><td>{e.active_jobs}</td><td>{fmtDuration(e.total_duration_minutes)}</td><td>{fmtDuration(Math.round(e.average_duration_minutes))}</td>{stages.map((s) => <td key={s}>{e.by_stage[s] || 0}</td>)}
              </tr>)}
            </tbody></table></div>
          </section>
          {data.employees.length > 0 && <section className="kpi-ranking-card"><div className="kpi-section-head"><div><h2>Target & Achievement</h2><p>Target Setrika saat ini menggunakan minimum 50 kg per hari aktif karyawan. Target ini nanti dapat dipindahkan ke pengaturan KPI.</p></div></div>
            <div className="kpi-target-grid">{data.employees.map((e) => <article className="kpi-target-card" key={e.user_id}><div className="kpi-target-head"><strong>{e.employee_name}</strong><span>{e.active_days} hari aktif</span></div>
              {Object.keys(e.target_by_stage).length === 0 ? <p className="muted-text">Belum ada target kuantitas untuk tahap ini.</p> : Object.entries(e.target_by_stage).map(([stage, targetUnits]) => <div key={stage} className="kpi-target-row"><div><strong>{stageLabels[stage]}</strong>{Object.entries(targetUnits).map(([unit, target]) => <span key={unit}>{fmtQty(e.quantity_by_stage[stage]?.[unit] || 0)} / {fmtQty(target)} {unit}</span>)}</div>{Object.entries(e.achievement_by_stage[stage] || {}).map(([unit, achievement]) => <span key={unit} className={`badge ${achievement >= 100 ? "badge-ok" : "badge-wait"}`}>{achievement}%</span>)}</div>)}
            </article>)}</div>
          </section>}
        </>}
      </main>
    </div>
  );
};

export default Kpi;
