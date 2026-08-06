'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import {
  Wallet, TrendingUp, TrendingDown, Plus,
  Search, X, Trash2, Pencil, History
} from "lucide-react";

const EMPTY_FORM = {
  category: 'Tithe',
  fund: 'General Fund',
  member: '',
  amount: '',
  type: 'income',
  status: 'Verified',
  date: new Date().toISOString().split('T')[0],
  notes: '',
  church_id: '',
};

const CATEGORIES = ['Tithe', 'Offering', 'Love Gift', 'Project Donation', 'Lot Fund Donation', 'Expense', 'Other'];
const FUNDS      = ['Monthly Budget', 'General Fund', 'Project Fund', 'Lot Fund'];
const STATUSES   = ['Verified', 'Pending', 'Unverified'];

const TYPE_COLORS = { income: "text-emerald-400", expense: "text-rose-400" };
const STATUS_BADGE = {
  Verified:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Pending:    "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Unverified: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const GLOBAL_ROLES = ["admin", "pastor"];

function T(dark) {
  return {
    pageBg:      dark ? "bg-[#0f111a]"        : "bg-slate-100",
    cardBg:      dark ? "bg-[#1a1d2e]/50"     : "bg-white/80",
    cardBorder:  dark ? "border-slate-800/60"  : "border-slate-200",
    textPrimary: dark ? "text-white"           : "text-slate-900",
    textSub:     dark ? "text-slate-500"       : "text-slate-500",
    textMuted:   dark ? "text-slate-600"       : "text-slate-400",
    inputBg:     dark ? "bg-[#1a1d2e]"        : "bg-white",
    inputBorder: dark ? "border-slate-800"     : "border-slate-300",
    inputText:   dark ? "text-slate-200"       : "text-slate-800",
    divider:     dark ? "border-slate-800/40"  : "border-slate-200",
    filterInactive: dark ? "bg-[#1a1d2e] border-slate-800 text-slate-500 hover:text-slate-200" : "bg-white border-slate-300 text-slate-500 hover:text-slate-900",
    modalBg:     dark ? "bg-[#1a1d2e]"        : "bg-white",
    modalBorder: dark ? "border-slate-700"     : "border-slate-200",
    cancelBtn:   dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-900",
    emptyIcon:   dark ? "text-slate-700"       : "text-slate-300",
    tableHeadBg: dark ? "bg-slate-900/50"      : "bg-slate-100",
    rowHover:    dark ? "hover:bg-blue-500/5"  : "hover:bg-blue-50",
    innerCard:   dark ? "bg-slate-900/50"      : "bg-slate-50",
    deepCard:    dark ? "bg-slate-900/40"      : "bg-slate-100",
  };
}

export default function FinancePage() {
  const { dark } = useTheme();
  const t = T(dark);

  const [transactions, setTransactions] = useState([]);
  const [churches, setChurches]         = useState([]);
  const [profile, setProfile]           = useState(null);
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [editingTx, setEditingTx]       = useState(null);
  const [search, setSearch]             = useState("");
  const [filterType, setFilterType]     = useState("all");
  const [form, setForm]                 = useState(EMPTY_FORM);

  const isGlobal = profile && GLOBAL_ROLES.includes(profile.role);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from('profiles').select('role, church_id').eq('id', user.id).single();
    if (error) { console.error('Error fetching profile:', error.message); return null; }
    setProfile(data);
    return data;
  }

  async function fetchChurches() {
    const { data, error } = await supabase.from('churches').select('id, name').order('name', { ascending: true });
    if (error) { console.error('Error fetching churches:', error.message); return; }
    if (data) setChurches(data);
  }

  async function fetchTransactions() {
    setLoading(true);
    const { data, error } = await supabase.from('transactions').select('*').order('date_recorded', { ascending: false });
    if (!error) setTransactions(data || []);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const p = await fetchProfile();
      await fetchChurches();
      await fetchTransactions();
      if (p && !GLOBAL_ROLES.includes(p.role)) {
        setForm((f) => ({ ...f, church_id: p.church_id || '' }));
      }
    }
    init();
  }, []);

  function openAdd() {
    setEditingTx(null);
    setForm({ ...EMPTY_FORM, church_id: isGlobal ? (selectedBranch !== 'all' ? selectedBranch : '') : (profile?.church_id || '') });
    setShowModal(true);
  }

  function openEdit(tx) {
    setEditingTx(tx);
    setForm({
      category: tx.category || 'Tithe',
      fund:     tx.fund     || 'General Fund',
      member:   tx.member   || '',
      amount:   tx.amount   || '',
      type:     tx.type     || 'income',
      status:   tx.status   || 'Verified',
      date:     tx.date     || new Date().toISOString().split('T')[0],
      notes:    tx.notes    || '',
      church_id: tx.church_id || '',
    });
    setShowModal(true);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isGlobal && !form.church_id) {
      alert('Please select which branch this entry belongs to.');
      return;
    }
    setSaving(true);
    const payload = { ...form, amount: parseFloat(form.amount) || 0, member: form.member || 'Anonymous', church_id: isGlobal ? form.church_id : profile?.church_id };
    if (editingTx) {
      const { error } = await supabase.from('transactions').update(payload).eq('id', editingTx.id);
      if (error) alert('Error updating: ' + error.message);
    } else {
      const { error } = await supabase.from('transactions').insert([payload]);
      if (error) alert('Error saving: ' + error.message);
    }
    setSaving(false);
    setShowModal(false);
    setEditingTx(null);
    setForm(EMPTY_FORM);
    await fetchTransactions();
  }

  async function handleDelete(tx) {
    if (!window.confirm(`Delete this entry?`)) return;
    const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
    if (error) alert('Error deleting: ' + error.message);
    else setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
  }

  const churchName = (id) => churches.find((c) => c.id === id)?.name;

  const branchScoped = isGlobal && selectedBranch !== 'all' ? transactions.filter((t) => t.church_id === selectedBranch) : transactions;

  const totalIncome  = branchScoped.filter(t => t.type === 'income').reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalExpense = branchScoped.filter(t => t.type === 'expense').reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalBalance = totalIncome - totalExpense;

  const fundTotals = FUNDS.reduce((acc, fund) => {
    acc[fund] = branchScoped.filter(t => t.fund === fund && t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return acc;
  }, {});

  const filtered = branchScoped.filter((tx) => {
    const matchSearch = tx.category?.toLowerCase().includes(search.toLowerCase()) || tx.member?.toLowerCase().includes(search.toLowerCase()) || tx.fund?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || tx.type === filterType;
    return matchSearch && matchType;
  });

  return (
    <div className={`p-8 min-h-screen ${t.pageBg} ${t.textPrimary} transition-colors duration-200`}>

      <div className="flex justify-between items-start mb-8">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}>GGCF-GMI · Pandi, Bulacan</p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Financial Ledger</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Track tithes, offerings, and church fund allocations</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-blue-900/20">
          <Plus size={16} /> New Entry
        </button>
      </div>

      {isGlobal && (
        <div className="flex items-center gap-2 mb-6">
          <span className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>Viewing</span>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}
            className={`${t.inputBg} border ${t.inputBorder} rounded-xl py-2 px-4 text-sm ${t.inputText} focus:outline-none focus:border-blue-500 transition-colors`}>
            <option value="all">All Branches (combined)</option>
            {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Balance"  amount={totalBalance} icon={Wallet}       color="text-blue-400" t={t} />
        <StatCard label="Total Income"   amount={totalIncome}  icon={TrendingUp}   color="text-emerald-400" t={t} />
        <StatCard label="Total Expenses" amount={totalExpense} icon={TrendingDown} color="text-rose-400" t={t} />
      </div>

      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 mb-6 backdrop-blur-sm`}>
        <h3 className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub} mb-5 border-b ${t.divider} pb-3`}>Fund Breakdown</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Monthly Budget", dot: "bg-yellow-500" },
            { label: "General Fund",   dot: "bg-blue-500" },
            { label: "Project Fund",   dot: "bg-purple-500" },
            { label: "Lot Fund",       dot: "bg-pink-500" },
          ].map(({ label, dot }) => (
            <div key={label} className={`${t.innerCard} rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${dot}`} />
                <span className={`text-[10px] ${t.textSub} uppercase tracking-wider font-bold`}>{label}</span>
              </div>
              <p className={`text-lg font-black ${t.textPrimary} font-mono`}>₱{(fundTotals[label] || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            </div>
          ))}
        </div>

        <div className={`mt-4 grid grid-cols-3 gap-3`}>
          {[
            { label: "General Fund", pct: "50%", color: "text-blue-400" },
            { label: "Project Fund", pct: "25%", color: "text-purple-400" },
            { label: "Lot Fund",     pct: "25%", color: "text-pink-400" },
          ].map((item) => (
            <div key={item.label} className={`${t.deepCard} rounded-xl p-3 text-center`}>
              <p className={`text-base font-black ${item.color}`}>{item.pct}</p>
              <p className={`text-[9px] ${t.textMuted} mt-0.5 uppercase tracking-wider`}>{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-2.5 w-4 h-4 ${t.textSub}`} />
          <input type="text" placeholder="Search by category, member, or fund..." value={search} onChange={(e) => setSearch(e.target.value)}
            className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 pl-9 pr-4 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`} />
        </div>
        <div className="flex gap-2">
          {["all", "income", "expense"].map((tp) => (
            <button key={tp} onClick={() => setFilterType(tp)} className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${filterType === tp ? "bg-blue-600 text-white" : t.filterInactive}`}>{tp}</button>
          ))}
        </div>
      </div>

      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl overflow-hidden backdrop-blur-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={`${t.tableHeadBg} text-[10px] uppercase tracking-widest ${t.textSub} font-bold border-b ${t.divider}`}>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Fund</th>
                <th className="px-6 py-4">Member / Payee</th>
                {isGlobal && <th className="px-6 py-4">Branch</th>}
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className={`divide-y ${t.divider}`}>
              {loading ? (
                <tr><td colSpan={isGlobal ? 8 : 7} className={`text-center py-14 ${t.textMuted} text-sm`}>Loading ledger...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={isGlobal ? 8 : 7} className="text-center py-14">
                  <History className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
                  <p className={`${t.textMuted} text-sm`}>{search || filterType !== "all" ? "No entries match your search." : "No transactions yet. Add one!"}</p>
                </td></tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className={`${t.rowHover} transition-colors`}>
                    <td className={`px-6 py-4 ${t.textSub} text-sm`}>{tx.date ? new Date(tx.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                    <td className={`px-6 py-4 font-semibold ${t.textPrimary} text-sm`}>{tx.category}</td>
                    <td className="px-6 py-4 text-blue-400 text-xs font-medium">{tx.fund || '—'}</td>
                    <td className={`px-6 py-4 ${t.textSub} text-sm`}>{tx.member || '—'}</td>
                    {isGlobal && <td className={`px-6 py-4 ${t.textMuted} text-xs`}>{churchName(tx.church_id) || '—'}</td>}
                    <td className={`px-6 py-4 font-black text-sm font-mono ${TYPE_COLORS[tx.type] || t.textPrimary}`}>{tx.type === 'expense' ? '−' : '+'}₱{(Number(tx.amount) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-center"><span className={`border text-[10px] uppercase font-bold px-3 py-1 rounded-full ${STATUS_BADGE[tx.status] || STATUS_BADGE.Verified}`}>{tx.status}</span></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(tx)} className={`${t.textMuted} hover:text-blue-400 transition-colors p-1 rounded-lg ${dark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(tx)} className={`${t.textMuted} hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10`}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className={`px-6 py-3 border-t ${t.divider} text-[10px] ${t.textMuted} uppercase tracking-widest`}>Showing {filtered.length} of {branchScoped.length} entries</div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-lg font-black ${t.textPrimary}`}>{editingTx ? 'Edit Entry' : 'New Entry'}</h2>
              <button onClick={() => setShowModal(false)} className={`${t.textSub} hover:text-blue-400 transition-colors`}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                {['income', 'expense'].map((tp) => (
                  <button key={tp} type="button" onClick={() => setForm({ ...form, type: tp })}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold capitalize border transition-all ${form.type === tp ? (tp === 'income' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-rose-600 border-rose-500 text-white') : `${t.inputBg} ${t.inputBorder} ${t.textSub}`}`}>
                    {tp === 'income' ? '+ Income' : '− Expense'}
                  </button>
                ))}
              </div>

              {isGlobal && (
                <Field label="Branch" required t={t}>
                  <select name="church_id" value={form.church_id} onChange={handleChange} className={inputStyle(t)}>
                    <option value="">Select a branch</option>
                    {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}

              <Field label="Category" t={t}>
                <select name="category" value={form.category} onChange={handleChange} className={inputStyle(t)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Fund" t={t}>
                <select name="fund" value={form.fund} onChange={handleChange} className={inputStyle(t)}>
                  {FUNDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>

              <Field label="Member / Payee" t={t}>
                <input type="text" name="member" value={form.member} onChange={handleChange} placeholder="e.g. Juan dela Cruz" className={inputStyle(t)} />
              </Field>

              <Field label="Amount (₱)" required t={t}>
                <input type="number" name="amount" value={form.amount} onChange={handleChange} required placeholder="e.g. 500" min="0" step="0.01" className={inputStyle(t)} onWheel={(e) => e.target.blur()} />
              </Field>

              <Field label="Date" t={t}>
                <input type="date" name="date" value={form.date} onChange={handleChange} className={inputStyle(t)} />
              </Field>

              <Field label="Status" t={t}>
                <select name="status" value={form.status} onChange={handleChange} className={inputStyle(t)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>

              <Field label="Notes" t={t}>
                <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Optional notes..." rows={2} className={`${inputStyle(t)} resize-none`} />
              </Field>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold transition-all`}>Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition-all">{saving ? 'Saving...' : editingTx ? 'Save Changes' : 'Add Entry'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function inputStyle(t) {
  return `w-full ${t.inputBg} border ${t.inputBorder} ${t.inputText} rounded-xl px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 placeholder:text-slate-500`;
}

function StatCard({ label, amount, icon: Icon, color, t }) {
  return (
    <div className={`${t.cardBg} border ${t.cardBorder} p-6 rounded-3xl backdrop-blur-sm`}>
      <div className={`p-2.5 rounded-xl ${t.innerCard} w-fit mb-4 ${color}`}><Icon size={20} /></div>
      <p className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub} mb-1`}>{label}</p>
      <h3 className={`text-2xl font-black ${t.textPrimary} font-mono`}>₱{(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h3>
    </div>
  );
}

function Field({ label, required, t, children }) {
  return (
    <div>
      <label className={`block text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1.5`}>{label} {required && <span className="text-red-400">*</span>}</label>
      {children}
    </div>
  );
}