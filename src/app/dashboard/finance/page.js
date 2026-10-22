'use client';

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import { can } from "@/app/lib/permissions";
import { useAuth } from "@/app/context/AuthContext";
import SpendingRequests from "@/app/components/SpendingRequests";
import {
  Wallet, TrendingUp, TrendingDown, Plus,
  Search, X, Ban, Pencil, History, Sun, Moon
} from "lucide-react";
import BranchLabel from "@/app/components/BranchLabel";
import { phToday } from "@/app/lib/phDate";
import DatePicker from "@/app/components/DatePicker";
import { alertDialog, confirmDialog } from "@/app/lib/dialog";
import { useDebounced } from "@/app/lib/useDebounced";

import { friendlyError } from '@/app/lib/errors';
import { peso } from "@/app/lib/format";
import { baseTheme } from '@/app/lib/theme';
import { useDialog } from '@/app/lib/useDialog';
const EMPTY_FORM = {
  category: 'Tithe',
  otherCategory: '',
  ministryName: '',
  fund: 'General Fund',
  member: '',
  amount: '',
  type: 'income',
  status: 'Verified',
  date: phToday(),
  notes: '',
  church_id: '',
};

const INCOME_CATEGORIES  = ['Tithe', 'Offering', 'Donation', 'Other'];
const EXPENSE_CATEGORIES = ['Love Gift', 'Ministry', 'Other'];
const MINISTRY_PREFIX = 'Ministry - ';
function categoriesForType(type) {
  return type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}
const FUNDS      = ['Monthly Budget', 'General Fund', 'Project Fund', 'Lot Fund'];
// Every entry counts as soon as it's saved (status 'Verified'). The only
// other status is Void, set by the Void button: the entry stays in the
// ledger but doesn't count in any total, and can't be changed.
const VOID = 'Void';
const NO_MEMBER_CATEGORIES = ['Tithe', 'Offering', 'Love Gift'];
const PAGE_SIZE  = 10;

// Older entries may still carry the pre-merge category names.
function normalizeCategory(cat) {
  if (cat === 'Project Donation' || cat === 'Lot Fund Donation') return 'Donation';
  return cat;
}

const STATUS_BADGE = {
  Verified:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Void:       "bg-slate-500/5 text-slate-500 border-slate-500/30 line-through",
};

const GLOBAL_ROLES = ["admin", "pastor"];

// Light mode is deliberately dimmed a notch off pure white/slate-100 (~90%
// as bright) so it doesn't glare next to the dark theme.
function T(dark) {
  return {
    ...baseTheme(dark),
  };
}

// Accent color for content text (numbers, icons) — the -400 shades read
// fine on the dark bg but are too pale for contrast on light.
const ACCENT = {
  blue:    { dark: "text-blue-400",    light: "text-blue-600" },
  emerald: { dark: "text-emerald-400", light: "text-emerald-600" },
  rose:    { dark: "text-rose-400",    light: "text-rose-600" },
};
function A(dark, color) {
  return dark ? ACCENT[color].dark : ACCENT[color].light;
}

export default function FinancePage() {
  return <Suspense fallback={null}><Finance /></Suspense>;
}

function Finance() {
  const params = useSearchParams();
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);

  // One page of the ledger and how many entries match (db/069); the totals
  // come from the database too, so they stay right however long the ledger.
  const [transactions, setTransactions] = useState([]);
  const [matchCount, setMatchCount]     = useState(0);
  const [fundRows, setFundRows]         = useState([]);   // { fund, income, expense }
  const [loadError, setLoadError]       = useState('');
  const [reload, setReload]             = useState(0);
  const [churches, setChurches]         = useState([]);
  const [profile, setProfile]           = useState(null);
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [editingTx, setEditingTx]       = useState(null);
  // ?q= (from the dashboard search) opens with the search filled in.
  const [search, setSearch]             = useState(() => params.get('q') || '');
  const [filterType, setFilterType]     = useState("all");
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [page, setPage]                 = useState(1);
  // Reminders link here with ?tab=requests.
  const [tab, setTab]                   = useState(() => params.get('tab') === 'requests' ? "requests" : "ledger");
  // Ledger entry id → spending request number, for entries a request made
  // (release, returned change). Those are locked (db/054).
  const [fromRequest, setFromRequest]   = useState({});
  const { user } = useAuth();

  const isGlobal = profile && GLOBAL_ROLES.includes(profile.role);
  // Only the Finance level records money; Pastor and Leaders view.
  const canEdit = can(profile?.role, 'finance', 'edit');

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from('profiles').select('role, church_id').eq('id', user.id).single();
    if (error) { console.error('Error fetching profile:', error.message); return null; }
    setProfile(data);
    return data;
  }

  // Member names for the Member / Payee box (Finance's "names" access): the
  // member directory gives names only, for their own branch.
  const [memberNames, setMemberNames] = useState([]);   // { full_name, church_id }
  async function fetchMemberNames() {
    const { data } = await supabase.from('member_directory').select('full_name, church_id').order('full_name');
    setMemberNames(data || []);
  }

  // Active ministries for the "Which Ministry?" picker (row rules: Finance
  // sees their own branch, the Pastor every branch).
  const [ministries, setMinistries] = useState([]);   // { name, church_id }
  async function fetchMinistries() {
    const { data, error } = await supabase.from('ministries').select('name, church_id').eq('is_active', true).order('name');
    if (error) { console.error('Error fetching ministries:', error.message); return; }
    setMinistries(data || []);
  }

  async function fetchChurches() {
    const { data, error } = await supabase.from('churches').select('id, name').order('name', { ascending: true });
    if (error) { console.error('Error fetching churches:', error.message); return; }
    if (data) setChurches(data);
  }

  // Reload the shown page and the totals (after a save, void or release).
  const fetchTransactions = () => setReload((n) => n + 1);

  // The Pastor's branch picker; everyone else sees their own branch (row rules).
  const branchFilter = isGlobal && selectedBranch !== 'all' ? selectedBranch : null;
  // Ask the server once typing pauses.
  const query = useDebounced(search.trim(), 300);

  // One page of entries, newest by the date shown in the list; same-day
  // entries in the order they were recorded.
  useEffect(() => {
    if (!profile) return;
    let stale = false;
    (async () => {
      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error } = await supabase
        .rpc('ledger_entries', { p_church: branchFilter, p_type: filterType === 'all' ? null : filterType, p_search: query || null }, { count: 'exact' })
        .order('date', { ascending: false, nullsFirst: false })
        .order('date_recorded', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (stale) return;
      if (error) {
        // Past the last page (the list got shorter): go to page 1.
        if (page > 1 && error.code === 'PGRST103') { setPage(1); return; }
        setLoadError(friendlyError(error, 'Could not load the ledger.'));
        setLoading(false);
        return;
      }
      if (page > 1 && !data?.length) { setPage(1); return; }
      // Entries a spending request made (release, returned change) are locked (db/054).
      const ids = (data || []).map((tx) => tx.id);
      const { data: reqs } = ids.length
        ? await supabase.from('expense_requests').select('id, transaction_id, change_transaction_id')
            .or(`transaction_id.in.(${ids.join(',')}),change_transaction_id.in.(${ids.join(',')})`)
        : { data: [] };
      if (stale) return;
      const links = {};
      (reqs || []).forEach((r) => {
        if (r.transaction_id) links[r.transaction_id] = r.id;
        if (r.change_transaction_id) links[r.change_transaction_id] = r.id;
      });
      setFromRequest(links);
      setTransactions(data || []);
      setMatchCount(count || 0);
      setLoadError('');
      setLoading(false);
    })();
    return () => { stale = true; };
  }, [profile, branchFilter, filterType, query, page, reload]);

  // Totals per fund, without voided entries (db/069 finance_summary).
  useEffect(() => {
    if (!profile) return;
    let stale = false;
    supabase.rpc('finance_summary', { p_church: branchFilter }).then(({ data, error }) => {
      if (stale) return;
      if (error) console.error(error);
      setFundRows(data || []);
    });
    return () => { stale = true; };
  }, [profile, branchFilter, reload]);

  useEffect(() => {
    async function init() {
      const p = await fetchProfile();
      if (!p) { setLoading(false); return; }
      await fetchChurches();
      if (can(p?.role, 'finance', 'edit')) await Promise.all([fetchMemberNames(), fetchMinistries()]);
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
    const normalized = normalizeCategory(tx.category) || 'Tithe';
    const knownCategories = categoriesForType(tx.type || 'income');
    let category, otherCategory = '', ministryName = '';
    if (normalized.startsWith(MINISTRY_PREFIX)) {
      category = 'Ministry';
      ministryName = normalized.slice(MINISTRY_PREFIX.length);
    } else if (knownCategories.includes(normalized)) {
      category = normalized;
    } else {
      category = 'Other';
      otherCategory = tx.category || '';
    }
    setEditingTx(tx);
    setForm({
      category,
      otherCategory,
      ministryName,
      fund:     tx.fund     || 'General Fund',
      member:   tx.member   || '',
      amount:   tx.amount   || '',
      type:     tx.type     || 'income',
      status:   'Verified',
      date:     tx.date     || phToday(),
      notes:    tx.notes    || '',
      church_id: tx.church_id || '',
    });
    setShowModal(true);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    if (name === 'category') {
      setForm({
        ...form,
        category: value,
        otherCategory: value === 'Other' ? form.otherCategory : '',
        ministryName: value === 'Ministry' ? form.ministryName : '',
      });
    } else {
      setForm({ ...form, [name]: value });
    }
  }

  function handleTypeChange(tp) {
    const nextCategory = categoriesForType(tp)[0];
    setForm({ ...form, type: tp, category: nextCategory, otherCategory: '', ministryName: '' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isGlobal && !form.church_id) {
      alertDialog('Please select which branch this entry belongs to.');
      return;
    }
    if (form.category === 'Other' && !form.otherCategory.trim()) {
      alertDialog('Please specify the category.');
      return;
    }
    if (form.category === 'Ministry' && !form.ministryName.trim()) {
      alertDialog('Please specify which ministry.');
      return;
    }
    if (!(parseFloat(form.amount) > 0)) {
      alertDialog('Amount must be more than ₱0.');
      return;
    }
    setSaving(true);
    const showMember = !NO_MEMBER_CATEGORIES.includes(form.category);
    const finalCategory =
      form.category === 'Other'    ? form.otherCategory.trim() :
      form.category === 'Ministry' ? `${MINISTRY_PREFIX}${form.ministryName.trim()}` :
      form.category;
    const { otherCategory, ministryName, ...rest } = form;
    const payload = { ...rest, category: finalCategory, amount: parseFloat(form.amount) || 0, member: showMember ? (form.member || 'Anonymous') : '', church_id: isGlobal ? form.church_id : profile?.church_id };
    const { error } = editingTx
      ? await supabase.from('transactions').update(payload).eq('id', editingTx.id)
      : await supabase.from('transactions').insert([payload]);
    setSaving(false);
    // Keep the form open with what was typed, so it can just be saved again.
    if (error) {
      alertDialog((editingTx ? 'Error updating: ' : 'Error saving: ') + friendlyError(error));
      return;
    }
    setShowModal(false);
    setEditingTx(null);
    setForm(EMPTY_FORM);
    await fetchTransactions();
  }

  // Entries are never deleted, only voided, so the record stays traceable.
  async function handleVoid(tx) {
    if (!await confirmDialog('Void this entry? It stays in the ledger but no longer counts in any total, and it can\'t be edited afterwards.')) return;
    const { data, error } = await supabase.from('transactions').update({ status: VOID }).eq('id', tx.id).select('id');
    if (error) alertDialog('Error voiding: ' + friendlyError(error));
    else if (!data?.length) alertDialog('You don\'t have permission to void this entry.');
    else fetchTransactions();   // the totals change too
  }

  const churchName = (id) => churches.find((c) => c.id === id)?.name;

  const totalIncome  = fundRows.reduce((a, r) => a + (Number(r.income) || 0), 0);
  const totalExpense = fundRows.reduce((a, r) => a + (Number(r.expense) || 0), 0);
  const totalBalance = totalIncome - totalExpense;

  // What's left in each fund: money in minus money spent from it.
  const fundTotals = FUNDS.reduce((acc, fund) => {
    const row = fundRows.find((r) => r.fund === fund);
    const income = Number(row?.income) || 0, expense = Number(row?.expense) || 0;
    acc[fund] = { income, expense, left: income - expense };
    return acc;
  }, {});

  const totalPages = Math.max(1, Math.ceil(matchCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const showMemberField = !NO_MEMBER_CATEGORIES.includes(form.category);
  // The entry's branch's ministries, plus the saved name when editing an
  // older entry whose ministry was typed in or has since been closed.
  const ministryOptions = [...new Set([
    ...ministries.filter((m) => !form.church_id || m.church_id === form.church_id).map((m) => m.name),
    ...(form.ministryName ? [form.ministryName] : []),
  ])];

  function handleSearchChange(e) {
    setSearch(e.target.value);
    setPage(1);
  }

  function handleFilterTypeChange(tp) {
    setFilterType(tp);
    setPage(1);
  }

  function handleBranchChange(id) {
    setSelectedBranch(id);
    setPage(1);
  }

  // Pop-ups: focus, Tab, Esc and a name for screen readers (lib/useDialog).
  const entryDialogRef = useDialog(showModal, () => setShowModal(false));

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} ${t.textPrimary} transition-colors duration-200`}>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}><BranchLabel /></p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Financial Ledger</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Track tithes, offerings, and church fund allocations</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0`}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {canEdit && tab === "ledger" && (
            <button onClick={openAdd} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-blue-900/20 shrink-0">
              <Plus size={16} /> New Entry
            </button>
          )}
        </div>
      </div>

      {isGlobal && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-6">
          <span className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>Viewing</span>
          <select value={selectedBranch} onChange={(e) => handleBranchChange(e.target.value)}
            className={`w-full sm:w-auto ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 px-4 text-sm ${t.inputText} focus:outline-none focus:border-blue-500 transition-colors`}>
            <option value="all">All Branches (combined)</option>
            {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Tabs: ledger and spending requests (F2) */}
      <div className={`flex gap-1 ${t.cardBg} border ${t.cardBorder} rounded-xl p-1 w-fit mb-6`}>
        {[
          { key: "ledger",   label: "Ledger" },
          { key: "requests", label: "Spending requests" },
        ].map((x) => (
          <button key={x.key} onClick={() => setTab(x.key)}
            className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all ${tab === x.key ? "bg-blue-600 text-white shadow" : t.textSub}`}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === "requests" && (
        <SpendingRequests
          t={t} dark={dark}
          role={profile?.role} userId={user?.id}
          churches={churches} isGlobal={isGlobal} branch={selectedBranch}
          onReleased={fetchTransactions}
        />
      )}

      {tab === "ledger" && (<>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Balance"  amount={totalBalance} icon={Wallet}       color={A(dark, "blue")} t={t} />
        <StatCard label="Total Income"   amount={totalIncome}  icon={TrendingUp}   color={A(dark, "emerald")} t={t} />
        <StatCard label="Total Expenses" amount={totalExpense} icon={TrendingDown} color={A(dark, "rose")} t={t} />
      </div>

      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 mb-6 backdrop-blur-sm`}>
        <h3 className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub} mb-5 border-b ${t.divider} pb-3`}>Fund Balances <span className="normal-case tracking-normal font-normal">— what&apos;s left in each fund (money in − money spent)</span></h3>
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
              <p className={`text-lg font-black font-mono ${fundTotals[label].left < 0 ? A(dark, "rose") : t.textPrimary}`}>{peso(fundTotals[label].left)}</p>
              <p className={`text-[10px] ${t.textMuted} mt-1 font-mono`}>
                <span className={A(dark, "emerald")}>+{peso(fundTotals[label].income)}</span>
                {' · '}
                <span className={A(dark, "rose")}>−{peso(fundTotals[label].expense)}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-2.5 w-4 h-4 ${t.textSub}`} />
          <input type="text" placeholder="Search by category, member, fund, or notes..." value={search} onChange={handleSearchChange}
            className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 pl-9 pr-4 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`} />
        </div>
        <div className="flex gap-2">
          {["all", "income", "expense"].map((tp) => (
            <button key={tp} onClick={() => handleFilterTypeChange(tp)} className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${filterType === tp ? "bg-blue-600 text-white" : t.filterInactive}`}>{tp}</button>
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
              ) : loadError || matchCount === 0 ? (
                <tr><td colSpan={isGlobal ? 8 : 7} className="text-center py-14">
                  <History className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
                  <p className={`${t.textMuted} text-sm`}>{loadError || (search || filterType !== "all" ? "No entries match your search." : "No transactions yet. Add one!")}</p>
                </td></tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className={`${t.rowHover} transition-colors`}>
                    <td className={`px-6 py-4 ${t.textSub} text-sm`}>{tx.date ? new Date(tx.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                    <td className={`px-6 py-4 font-semibold ${t.textPrimary} text-sm`}>{tx.category}</td>
                    <td className="px-6 py-4 text-blue-400 text-xs font-medium">{tx.fund || '—'}</td>
                    <td className={`px-6 py-4 ${t.textSub} text-sm`}>{tx.member || '—'}</td>
                    {isGlobal && <td className={`px-6 py-4 ${t.textMuted} text-xs`}>{churchName(tx.church_id) || '—'}</td>}
                    <td className={`px-6 py-4 font-black text-sm font-mono ${tx.status === VOID ? `${t.textMuted} line-through` : tx.type === 'income' ? A(dark, "emerald") : tx.type === 'expense' ? A(dark, "rose") : t.textPrimary}`}>{tx.type === 'expense' ? '−' : '+'}{peso(tx.amount)}</td>
                    <td className="px-6 py-4 text-center"><span className={`border text-[10px] uppercase font-bold px-3 py-1 rounded-full ${tx.status === VOID ? STATUS_BADGE.Void : STATUS_BADGE.Verified}`}>{tx.status === VOID ? 'Void' : 'Verified'}</span></td>
                    <td className="px-6 py-4">
                      {fromRequest[tx.id] ? (
                        <button onClick={() => setTab('requests')} title="Made by a spending request — correct it through the request"
                          className={`whitespace-nowrap text-[10px] font-bold px-2 py-1 rounded-lg border ${t.iconBtn}`}>
                          From request #{fromRequest[tx.id]}
                        </button>
                      ) : canEdit && tx.status !== VOID && (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(tx)} title="Edit" className={`${t.textMuted} hover:text-blue-400 transition-colors p-1 rounded-lg ${dark ? "hover:bg-slate-800" : "hover:bg-slate-300"}`}><Pencil size={13} /></button>
                          <button onClick={() => handleVoid(tx)} title="Void" className={`${t.textMuted} hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10`}><Ban size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && !loadError && matchCount > 0 && (
          <div className={`px-6 py-3 border-t ${t.divider} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}>
            <span className={`text-[10px] ${t.textMuted} uppercase tracking-widest`}>
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, matchCount)} of {matchCount} entries
            </span>
            {matchCount > PAGE_SIZE && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${t.filterInactive}`}>Prev</button>
                <span className={`text-xs ${t.textSub} font-semibold px-1`}>Page {currentPage} of {totalPages}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${t.filterInactive}`}>Next</button>
              </div>
            )}
          </div>
        )}
      </div>
      </>)}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div ref={entryDialogRef} role="dialog" aria-modal="true" aria-label={editingTx ? 'Edit entry' : 'New entry'} className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-lg font-black ${t.textPrimary}`}>{editingTx ? 'Edit Entry' : 'New Entry'}</h2>
              <button aria-label="Close" onClick={() => setShowModal(false)} className={`${t.textSub} hover:text-blue-400 transition-colors`}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                {['income', 'expense'].map((tp) => (
                  <button key={tp} type="button" onClick={() => handleTypeChange(tp)}
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
                  {categoriesForType(form.type).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              {form.category === 'Other' && (
                <Field label="Specify Category" required t={t}>
                  <input type="text" name="otherCategory" value={form.otherCategory} onChange={handleChange} required placeholder="e.g. Building Fund, Love Offering..." className={inputStyle(t)} />
                </Field>
              )}

              {form.category === 'Ministry' && (
                <Field label="Which Ministry?" required t={t}>
                  <select name="ministryName" value={form.ministryName} onChange={handleChange} required className={inputStyle(t)}>
                    <option value="">Select a ministry…</option>
                    {ministryOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              )}

              <Field label="Fund" t={t}>
                <select name="fund" value={form.fund} onChange={handleChange} className={inputStyle(t)}>
                  {FUNDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>

              {showMemberField && (
                <Field label="Member / Payee" t={t}>
                  <input type="text" name="member" value={form.member} onChange={handleChange} placeholder="e.g. Juan dela Cruz" list="finance-member-names" autoComplete="off" className={inputStyle(t)} />
                  {/* Suggestions from the branch's members; anything else (a store, a company) can still be typed. */}
                  <datalist id="finance-member-names">
                    {[...new Set(memberNames.filter((m) => !form.church_id || m.church_id === form.church_id).map((m) => m.full_name))]
                      .map((name) => <option key={name} value={name} />)}
                  </datalist>
                </Field>
              )}

              <Field label="Amount (₱)" required t={t}>
                <input type="number" name="amount" value={form.amount} onChange={handleChange} required placeholder="e.g. 500" min="0.01" step="0.01" className={inputStyle(t)} onWheel={(e) => e.target.blur()} />
              </Field>

              <Field label="Date" t={t}>
                <DatePicker name="date" value={form.date} onChange={handleChange} clearable={false} ariaLabel="Date" className={inputStyle(t)} />
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
      <h3 className={`text-2xl font-black ${t.textPrimary} font-mono`}>{peso(amount)}</h3>
    </div>
  );
}

function Field({ label, required, t, children }) {
  // The label wraps the field, so screen readers announce it with the field.
  return (
    <label className="block">
      <span className={`block text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1.5`}>{label} {required && <span aria-hidden="true" className="text-red-400">*</span>}</span>
      {children}
    </label>
  );
}