'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabase";
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
  church_id: '', // NEW
};

const CATEGORIES = ['Tithe', 'Offering', 'Love Gift', 'Project Donation', 'Lot Fund Donation', 'Expense', 'Other'];
const FUNDS      = ['Monthly Budget', 'General Fund', 'Project Fund', 'Lot Fund'];
const STATUSES   = ['Verified', 'Pending', 'Unverified'];

const TYPE_COLORS = {
  income:  "text-emerald-400",
  expense: "text-rose-400",
};

const STATUS_BADGE = {
  Verified:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Pending:    "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Unverified: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

// NEW — roles that see/manage every branch
const GLOBAL_ROLES = ["admin", "pastor"];

export default function FinancePage() {
  const [transactions, setTransactions] = useState([]);
  const [churches, setChurches]         = useState([]); // NEW
  const [profile, setProfile]           = useState(null); // NEW: { role, church_id }
  const [selectedBranch, setSelectedBranch] = useState('all'); // NEW — admin/pastor branch filter
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [editingTx, setEditingTx]       = useState(null);
  const [search, setSearch]             = useState("");
  const [filterType, setFilterType]     = useState("all");
  const [form, setForm]                 = useState(EMPTY_FORM);

  const isGlobal = profile && GLOBAL_ROLES.includes(profile.role); // NEW

  // ── Data ──────────────────────────────────────────────────────────────────

  // NEW — who's logged in, what's their role/branch
  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('role, church_id')
      .eq('id', user.id)
      .single();
    if (error) {
      console.error('Error fetching profile:', error.message);
      return null;
    }
    setProfile(data);
    return data;
  }

  // NEW — branch list for the filter / dropdown / labels
  async function fetchChurches() {
    const { data, error } = await supabase
      .from('churches')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching churches:', error.message);
      return;
    }
    if (data) setChurches(data);
  }

  async function fetchTransactions() {
    setLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date_recorded', { ascending: false });
    if (!error) setTransactions(data || []);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const p = await fetchProfile();
      await fetchChurches();
      await fetchTransactions();
      // NEW — non-global users always record entries under their own branch
      if (p && !GLOBAL_ROLES.includes(p.role)) {
        setForm((f) => ({ ...f, church_id: p.church_id || '' }));
      }
    }
    init();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingTx(null);
    setForm({
      ...EMPTY_FORM,
      // NEW — pre-fill branch: admin defaults to whatever filter they're viewing (if a specific one), else must choose
      church_id: isGlobal
        ? (selectedBranch !== 'all' ? selectedBranch : '')
        : (profile?.church_id || ''),
    });
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
      church_id: tx.church_id || '', // NEW
    });
    setShowModal(true);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // NEW — guard: global-role users must pick a branch
    if (isGlobal && !form.church_id) {
      alert('Please select which branch this entry belongs to.');
      return;
    }

    setSaving(true);

    const payload = {
      ...form,
      amount: parseFloat(form.amount) || 0,
      member: form.member || 'Anonymous',
      // NEW — non-global users can never override their own branch
      church_id: isGlobal ? form.church_id : profile?.church_id,
    };

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
    const confirmed = window.confirm(`Delete this entry?`);
    if (!confirmed) return;
    const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
    if (error) alert('Error deleting: ' + error.message);
    else setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
  }

  // NEW — quick lookup for branch names
  const churchName = (id) => churches.find((c) => c.id === id)?.name;

  // ── Branch-scoped set ─────────────────────────────────────────────────────
  // NEW — everything below (stats, fund breakdown, table) is computed from
  // this, not from the raw `transactions` array. Non-admins are already
  // scoped server-side by RLS, so this only actually filters for admin/pastor.
  const branchScoped = isGlobal && selectedBranch !== 'all'
    ? transactions.filter((t) => t.church_id === selectedBranch)
    : transactions;

  // ── Computed ──────────────────────────────────────────────────────────────

  const totalIncome  = branchScoped.filter(t => t.type === 'income').reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalExpense = branchScoped.filter(t => t.type === 'expense').reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalBalance = totalIncome - totalExpense;

  // Fund breakdown — sum income per fund
  const fundTotals = FUNDS.reduce((acc, fund) => {
    acc[fund] = branchScoped
      .filter(t => t.fund === fund && t.type === 'income')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return acc;
  }, {});

  const filtered = branchScoped.filter((tx) => {
    const matchSearch =
      tx.category?.toLowerCase().includes(search.toLowerCase()) ||
      tx.member?.toLowerCase().includes(search.toLowerCase()) ||
      tx.fund?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || tx.type === filterType;
    return matchSearch && matchType;
  });

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 min-h-screen bg-[#0f111a] text-white">

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h1 className="text-2xl font-black text-white">Financial Ledger</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track tithes, offerings, and church fund allocations</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> New Entry
        </button>
      </div>

      {/* NEW — Branch filter, admin/pastor only */}
      {isGlobal && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Viewing</span>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="bg-[#1a1d2e] border border-slate-800 rounded-xl py-2 px-4 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="all">All Branches (combined)</option>
            {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Balance"    amount={totalBalance} icon={Wallet}       color="text-blue-400" />
        <StatCard label="Total Income"     amount={totalIncome}  icon={TrendingUp}   color="text-emerald-400" />
        <StatCard label="Total Expenses"   amount={totalExpense} icon={TrendingDown} color="text-rose-400" />
      </div>

      {/* Fund Breakdown */}
      <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 mb-6 backdrop-blur-sm">
        <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-5 border-b border-slate-800 pb-3">
          Fund Breakdown
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Monthly Budget", dot: "bg-yellow-500" },
            { label: "General Fund",   dot: "bg-blue-500" },
            { label: "Project Fund",   dot: "bg-purple-500" },
            { label: "Lot Fund",       dot: "bg-pink-500" },
          ].map(({ label, dot }) => (
            <div key={label} className="bg-slate-900/50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{label}</span>
              </div>
              <p className="text-lg font-black text-white font-mono">
                ₱{(fundTotals[label] || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
          ))}
        </div>

        {/* Allocation reminder */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "General Fund", pct: "50%", color: "text-blue-400" },
            { label: "Project Fund", pct: "25%", color: "text-purple-400" },
            { label: "Lot Fund",     pct: "25%", color: "text-pink-400" },
          ].map((item) => (
            <div key={item.label} className="bg-slate-900/40 rounded-xl p-3 text-center">
              <p className={`text-base font-black ${item.color}`}>{item.pct}</p>
              <p className="text-[9px] text-slate-600 mt-0.5 uppercase tracking-wider">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by category, member, or fund..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1a1d2e] border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {["all", "income", "expense"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                filterType === t
                  ? "bg-blue-600 text-white"
                  : "bg-[#1a1d2e] border border-slate-800 text-slate-500 hover:text-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/50 text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-800/60">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Fund</th>
                <th className="px-6 py-4">Member / Payee</th>
                {isGlobal && <th className="px-6 py-4">Branch</th>} {/* NEW */}
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={isGlobal ? 8 : 7} className="text-center py-14 text-slate-500 text-sm">Loading ledger...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isGlobal ? 8 : 7} className="text-center py-14">
                    <History className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">
                      {search || filterType !== "all" ? "No entries match your search." : "No transactions yet. Add one!"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-blue-500/5 transition-colors">
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {tx.date ? new Date(tx.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-6 py-4 font-semibold text-white text-sm">{tx.category}</td>
                    <td className="px-6 py-4 text-blue-400 text-xs font-medium">{tx.fund || '—'}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{tx.member || '—'}</td>
                    {isGlobal && ( // NEW
                      <td className="px-6 py-4 text-slate-500 text-xs">{churchName(tx.church_id) || '—'}</td>
                    )}
                    <td className={`px-6 py-4 font-black text-sm font-mono ${TYPE_COLORS[tx.type] || 'text-white'}`}>
                      {tx.type === 'expense' ? '−' : '+'}₱{(Number(tx.amount) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`border text-[10px] uppercase font-bold px-3 py-1 rounded-full ${STATUS_BADGE[tx.status] || STATUS_BADGE.Verified}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(tx)} className="text-slate-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(tx)} className="text-slate-600 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-800/40 text-[10px] text-slate-600 uppercase tracking-widest">
            Showing {filtered.length} of {branchScoped.length} entries
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-white">{editingTx ? 'Edit Entry' : 'New Entry'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Income / Expense Toggle */}
              <div className="flex gap-2">
                {['income', 'expense'].map((t) => (
                  <button
                    key={t} type="button"
                    onClick={() => setForm({ ...form, type: t })}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold capitalize border transition-all ${
                      form.type === t
                        ? t === 'income' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    {t === 'income' ? '+ Income' : '− Expense'}
                  </button>
                ))}
              </div>

              {/* NEW — only global roles (admin/pastor) choose a branch */}
              {isGlobal && (
                <Field label="Branch" required>
                  <select name="church_id" value={form.church_id} onChange={handleChange} className="input-style">
                    <option value="">Select a branch</option>
                    {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}

              <Field label="Category">
                <select name="category" value={form.category} onChange={handleChange} className="input-style">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Fund">
                <select name="fund" value={form.fund} onChange={handleChange} className="input-style">
                  {FUNDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>

              <Field label="Member / Payee">
                <input type="text" name="member" value={form.member} onChange={handleChange}
                  placeholder="e.g. Juan dela Cruz" className="input-style" />
              </Field>

              <Field label="Amount (₱)" required>
                <input type="number" name="amount" value={form.amount} onChange={handleChange}
                    required placeholder="e.g. 500" min="0" step="0.01" className="input-style"
                    onWheel={(e) => e.target.blur()} />
              </Field>

              <Field label="Date">
                <input type="date" name="date" value={form.date} onChange={handleChange} className="input-style" />
              </Field>

              <Field label="Status">
                <select name="status" value={form.status} onChange={handleChange} className="input-style">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>

              <Field label="Notes">
                <textarea name="notes" value={form.notes} onChange={handleChange}
                  placeholder="Optional notes..." rows={2} className="input-style resize-none" />
              </Field>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                  {saving ? 'Saving...' : editingTx ? 'Save Changes' : 'Add Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .input-style {
          width: 100%;
          background: rgb(30 34 51 / 0.6);
          border: 1px solid rgb(100 116 139 / 0.3);
          color: white;
          border-radius: 0.75rem;
          padding: 0.625rem 1rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-style:focus { border-color: rgb(59 130 246); }
        .input-style::placeholder { color: rgb(100 116 139); }
        option { background: #1a1d2e; color: white; }
      `}</style>
    </div>
  );
}

function StatCard({ label, amount, icon: Icon, color }) {
  return (
    <div className="bg-[#1a1d2e]/50 border border-slate-800/60 p-6 rounded-3xl backdrop-blur-sm">
      <div className={`p-2.5 rounded-xl bg-slate-900/80 w-fit mb-4 ${color}`}>
        <Icon size={20} />
      </div>
      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">{label}</p>
      <h3 className="text-2xl font-black text-white font-mono">
        ₱{(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
      </h3>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}