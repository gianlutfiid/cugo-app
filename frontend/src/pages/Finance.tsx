import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Branch, createExpense, Expense, formatApiError, getFinanceSummary, FinanceSummary, listBranches, listExpenses } from "../api/client";
import { useAuth } from "../auth/AuthContext";

const today = new Date();
const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const expenseCategories = ["Gaji", "Sewa", "Listrik", "Air", "Internet", "Detergen & Chemical", "Transportasi", "Perawatan Mesin", "Perlengkapan Operasional", "Marketing", "Pajak & Legal", "Lain-lain"];
const paymentLabels: Record<string, string> = { cash: "Cash", qris: "QRIS", transfer: "Transfer", other: "Lainnya" };

const Finance: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState(toDateInput(monthStart));
  const [endDate, setEndDate] = useState(toDateInput(today));
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showExpense, setShowExpense] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManage = useMemo(() => { if (!branchId || !user) return false; if (user.is_superadmin) return true; return user.memberships.some((m) => m.branch_id === branchId && m.role === "branch_admin"); }, [branchId, user]);

  const load = async () => {
    if (!startDate || !endDate) return;
    setLoading(true); setError(null);
    try {
      const [s, e] = await Promise.all([
        getFinanceSummary({ start_date: startDate, end_date: endDate, branch_id: branchId || undefined }),
        listExpenses({ start_date: startDate, end_date: endDate, branch_id: branchId || undefined }),
      ]);
      setSummary(s); setExpenses(e);
    } catch (err: any) { setError(formatApiError(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  useEffect(() => { listBranches().then((b) => { setBranches(b); if (b.length === 1) setBranchId(b[0].id); }).catch((err: any) => setError(formatApiError(err.response?.data?.detail))); }, []);
  useEffect(() => { load(); }, [startDate, endDate, branchId]);

  return <div className="app" data-testid="finance-page">
    <header className="topbar"><div className="brand"><span className="brand-mark">CUGO</span><span className="brand-dot" /><span className="brand-sub">Finance</span></div><div className="topbar-right"><button className="btn-ghost" onClick={() => navigate("/")}>Dashboard</button>{canManage && <button className="btn-primary" onClick={() => setShowExpense(true)}>Tambah Pengeluaran</button>}</div></header>
    <main className="hero users-main finance-main">
      <p className="eyebrow">Keuangan</p><div className="kpi-title-row"><div><h1 className="title">Keuangan &amp; Laporan</h1><p className="subtitle">Pendapatan berasal dari nota laundry, sementara biaya operasional dicatat sebagai pengeluaran cabang.</p></div><button className="btn-ghost" onClick={load} disabled={loading}>Refresh</button></div>
      <div className="kpi-filters"><label className="field"><span className="field-label">Mulai</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label className="field"><span className="field-label">Sampai</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>{branches.length > 1 && <label className="field"><span className="field-label">Cabang</span><select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Semua cabang yang bisa diakses</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label>}</div>
      {error && <div className="auth-error">{error}</div>}
      {loading ? <div className="spinner" /> : summary && <>
        <div className="finance-report-note">Pendapatan pada laporan ini memakai nilai nota (akrual sederhana). <strong>Kas masuk</strong> menunjukkan jumlah yang sudah dibayar customer. Piutang = pendapatan dikurangi kas masuk.</div>
        <section className="kpi-summary-grid"><div className="kpi-stat"><span>Pendapatan</span><strong>{rupiah(summary.revenue)}</strong></div><div className="kpi-stat"><span>Kas masuk</span><strong>{rupiah(summary.cash_received)}</strong></div><div className="kpi-stat"><span>Piutang</span><strong>{rupiah(summary.receivables)}</strong></div><div className="kpi-stat"><span>Pengeluaran</span><strong>{rupiah(summary.expenses)}</strong></div><div className="kpi-stat"><span>Laba bersih</span><strong>{rupiah(summary.net_profit)}</strong></div></section>
        <section className="kpi-summary-grid"><div className="kpi-stat"><span>Jumlah nota</span><strong>{summary.order_count}</strong></div><div className="kpi-stat"><span>Jumlah pengeluaran</span><strong>{summary.expense_count}</strong></div>{Object.entries(summary.revenue_by_payment_method).map(([method, value]) => <div className="kpi-stat" key={method}><span>Kas · {paymentLabels[method] || method}</span><strong>{rupiah(value)}</strong></div>)}</section>
        <section className="kpi-ranking-card"><div className="kpi-section-head"><div><h2>Pengeluaran Operasional</h2><p>Rincian biaya pada periode terpilih.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th>Metode</th><th>Nominal</th><th>Dicatat oleh</th></tr></thead><tbody>{expenses.length === 0 ? <tr><td colSpan={6} className="empty-cell">Belum ada pengeluaran.</td></tr> : expenses.map((e) => <tr key={e.id}><td>{new Date(`${e.transaction_date}T00:00:00`).toLocaleDateString("id-ID")}</td><td><strong>{e.category}</strong></td><td>{e.description}{e.notes ? <div className="muted-text">{e.notes}</div> : null}</td><td>{paymentLabels[e.payment_method] || e.payment_method}</td><td>{rupiah(e.amount)}</td><td>{e.created_by_name || "—"}</td></tr>)}</tbody></table></div></section>
        <section className="kpi-ranking-card"><div className="kpi-section-head"><div><h2>Pengeluaran per Kategori</h2><p>Distribusi biaya untuk membaca komponen biaya terbesar.</p></div></div><div className="kpi-summary-quantity">{Object.entries(summary.expenses_by_category).map(([category, amount]) => <div className="kpi-stat" key={category}><span>{category}</span><strong>{rupiah(amount)}</strong></div>)}</div></section>
      </>}
    </main>
    {showExpense && <ExpenseModal branches={branches.filter((b) => b.is_active)} defaultBranchId={branchId} onClose={() => setShowExpense(false)} onSaved={() => { setShowExpense(false); load(); }} />}
  </div>;
};

const ExpenseModal: React.FC<{ branches: Branch[]; defaultBranchId: string; onClose: () => void; onSaved: () => void }> = ({ branches, defaultBranchId, onClose, onSaved }) => {
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "");
  const [transactionDate, setTransactionDate] = useState(toDateInput(today));
  const [category, setCategory] = useState(expenseCategories[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setError(null); const numeric = Number(amount); if (!branchId || !description.trim() || !Number.isInteger(numeric) || numeric <= 0) return setError("Cabang, keterangan, dan nominal wajib diisi dengan benar."); setSaving(true); try { await createExpense({ branch_id: branchId, transaction_date: transactionDate, category, description: description.trim(), amount: numeric, payment_method: paymentMethod, notes: notes.trim() || null }); onSaved(); } catch (err: any) { setError(formatApiError(err.response?.data?.detail)); } finally { setSaving(false); } };
  return <div className="modal-overlay"><form className="modal-card" onSubmit={submit}><h2 className="modal-title">Tambah Pengeluaran</h2><label className="field"><span className="field-label">Cabang</span><select value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label><div className="form-grid-two"><label className="field"><span className="field-label">Tanggal</span><input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} /></label><label className="field"><span className="field-label">Kategori</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{expenseCategories.map((x) => <option key={x}>{x}</option>)}</select></label></div><label className="field"><span className="field-label">Keterangan</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pembayaran listrik September" /></label><div className="form-grid-two"><label className="field"><span className="field-label">Nominal (Rp)</span><input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500000" /></label><label className="field"><span className="field-label">Metode pembayaran</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>{Object.entries(paymentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><label className="field"><span className="field-label">Catatan</span><textarea className="textarea-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Opsional" /></label>{error && <div className="auth-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn-ghost" onClick={onClose}>Batal</button><button className="btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Pengeluaran"}</button></div></form></div>;
};

export default Finance;
