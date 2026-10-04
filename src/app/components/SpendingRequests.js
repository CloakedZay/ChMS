'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Plus, X, Check, Ban, Loader2, HandCoins, Settings2 } from 'lucide-react';

// Spending requests (step F2, db/017 + db/018). Lives on the Finance page.
// The database enforces every rule; this panel only shows the buttons each
// person may use:
//   Pastor, Leaders     submit; approve / reject when can_decide_expense()
//   requester           cancel while pending
//   Finance             release an approved request (records the expense)
//   Pastor              set each branch's approval limit

export const REQUEST_CATEGORIES = ['Ministry expense', 'Reimbursement', 'Love gift', 'Other'];

const STATUS_STYLE = {
  pending:   'bg-orange-500/10 text-orange-400 border-orange-500/20',
  approved:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  released:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected:  'bg-rose-500/10 text-rose-400 border-rose-500/20',
  cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const FILTERS = [
  { key: 'pending',  label: 'Waiting for approval' },
  { key: 'approved', label: 'Approved — to release' },
  { key: 'released', label: 'Released' },
  { key: 'closed',   label: 'Rejected / cancelled' },
  { key: 'all',      label: 'All' },
];

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const shortDate = (ts) => ts
  ? new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  : '—';

// Same rule the database fixes when the request is made (db/017).
function ruleFor({ category, amount, limit, byPastor }) {
  const over = Number(amount) > Number(limit);
  if (category === 'Love gift' || byPastor) return over ? '2 Elders' : '1 Elder';
  if (over) return 'the Pastor and 1 Elder';
  return '1 approval from the Pastor or a Leader';
}

function ruleText(r) {
  if (r.elders_only) return r.required_count >= 2 ? '2 Elders' : '1 Elder';
  if (r.needs_pastor) return 'the Pastor and 1 Elder';
  return '1 approval from the Pastor or a Leader';
}

const EMPTY = { title: '', category: REQUEST_CATEGORIES[0], amount: '', description: '', church_id: '' };

export default function SpendingRequests({ t, dark, role, userId, churches, isGlobal, branch, onReleased }) {
  const canSubmit  = role === 'pastor' || role === 'leader';
  const canRelease = role === 'finance';
  const isPastor   = role === 'pastor';

  const [requests, setRequests]   = useState([]);
  const [approvals, setApprovals] = useState({});   // request id → approvals
  const [canDecide, setCanDecide] = useState({});   // request id → boolean
  const [limits, setLimits]       = useState({});   // church id → limit
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('pending');
  const [busyId, setBusyId]       = useState(null);

  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);

  // Approve / reject dialog (an in-page box — browser prompt() pop-ups are
  // blocked silently in some browsers and previews).
  const [deciding, setDeciding]   = useState(null);   // { request, decision }
  const [note, setNote]           = useState('');
  const [noteError, setNoteError] = useState('');

  const [showLimits, setShowLimits] = useState(false);
  const [limitDraft, setLimitDraft] = useState({});

  const churchName = (id) => churches.find((c) => c.id === id)?.name;

  const load = useCallback(async () => {
    const [{ data: reqs }, { data: apps }, { data: settings }] = await Promise.all([
      supabase.from('expense_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('expense_approvals').select('*').order('created_at', { ascending: true }),
      supabase.from('finance_settings').select('church_id, approval_limit'),
    ]);
    const byReq = {};
    (apps || []).forEach((a) => { (byReq[a.request_id] ||= []).push(a); });
    const lim = {};
    (settings || []).forEach((s) => { lim[s.church_id] = Number(s.approval_limit); });

    // Ask the database who may decide each pending request.
    const pending = (reqs || []).filter((r) => r.status === 'pending' && r.requested_by !== userId);
    const decide = {};
    if (canSubmit) {
      const answers = await Promise.all(pending.map((r) => supabase.rpc('can_decide_expense', { req_id: r.id })));
      pending.forEach((r, i) => { decide[r.id] = answers[i].data === true; });
    }
    return { reqs: reqs || [], byReq, lim, decide };
  }, [userId, canSubmit]);

  const apply = ({ reqs, byReq, lim, decide }) => {
    setRequests(reqs);
    setApprovals(byReq);
    setLimits(lim);
    setCanDecide(decide);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    load().then((d) => { if (!cancelled) apply(d); });
    return () => { cancelled = true; };
  }, [load]);

  async function refresh() { apply(await load()); }

  // ── Actions ─────────────────────────────────────────────────────────────
  async function submit(e) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.title.trim() || !(amount > 0)) { alert('Please give a title and an amount above zero.'); return; }
    if (isPastor && !form.church_id) { alert('Please choose which branch this is for.'); return; }
    setSaving(true);
    const { error } = await supabase.from('expense_requests').insert({
      title: form.title.trim(),
      category: form.category,
      amount,
      description: form.description.trim() || null,
      church_id: isPastor ? form.church_id : null,
      requested_by: userId,
    });
    setSaving(false);
    if (error) { alert('Could not submit: ' + error.message); return; }
    setShowForm(false);
    setForm(EMPTY);
    setFilter('pending');
    await refresh();
  }

  function openDecision(r, decision) {
    setNote('');
    setNoteError('');
    setDeciding({ request: r, decision });
  }

  async function confirmDecision() {
    const { request: r, decision } = deciding;
    if (decision === 'reject' && !note.trim()) { setNoteError('Please give a reason for rejecting.'); return; }
    setBusyId(r.id);
    const { error } = await supabase.from('expense_approvals').insert({
      request_id: r.id, decision, note: note.trim() || null, approver_id: userId,
    });
    setBusyId(null);
    if (error) { setNoteError('Could not save your decision: ' + error.message); return; }
    setDeciding(null);
    await refresh();
  }

  async function cancelRequest(r) {
    if (!window.confirm(`Cancel your request "${r.title}"?`)) return;
    setBusyId(r.id);
    const { error } = await supabase.from('expense_requests').update({ status: 'cancelled' }).eq('id', r.id);
    setBusyId(null);
    if (error) { alert('Could not cancel: ' + error.message); return; }
    await refresh();
  }

  async function release(r) {
    if (!window.confirm(`Release ${peso(r.amount)} for "${r.title}"? This records the expense in the ledger.`)) return;
    setBusyId(r.id);
    const { error } = await supabase.from('expense_requests').update({ status: 'released' }).eq('id', r.id);
    setBusyId(null);
    if (error) { alert('Could not release: ' + error.message); return; }
    await refresh();
    onReleased?.();
  }

  async function saveLimit(churchId) {
    const value = parseFloat(limitDraft[churchId]);
    if (!(value > 0)) { alert('Enter an amount above zero.'); return; }
    const { data, error } = await supabase.from('finance_settings')
      .update({ approval_limit: value, updated_at: new Date().toISOString() })
      .eq('church_id', churchId).select('church_id');
    if (error || !data?.length) { alert('Could not save the limit: ' + (error?.message || 'not allowed.')); return; }
    setLimits((l) => ({ ...l, [churchId]: value }));
    setLimitDraft((d) => ({ ...d, [churchId]: undefined }));
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const scoped = isGlobal && branch !== 'all' ? requests.filter((r) => r.church_id === branch) : requests;
  const shown = scoped.filter((r) =>
    filter === 'all' ? true :
    filter === 'closed' ? ['rejected', 'cancelled'].includes(r.status) :
    r.status === filter);
  const count = (key) => scoped.filter((r) =>
    key === 'all' ? true : key === 'closed' ? ['rejected', 'cancelled'].includes(r.status) : r.status === key).length;

  const formChurch = isPastor ? form.church_id : null;
  const formLimit  = limits[formChurch] ?? Object.values(limits)[0] ?? 5000;
  const input = `w-full ${t.inputBg} border ${t.inputBorder} ${t.inputText} rounded-xl px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 placeholder:text-slate-500`;

  // ── UI ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-2 flex-wrap flex-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${filter === f.key ? 'bg-blue-600 text-white' : t.filterInactive}`}>
              {f.label} <span className="opacity-70">({count(f.key)})</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {isPastor && (
            <button onClick={() => setShowLimits((v) => !v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border ${t.iconBtn}`}>
              <Settings2 size={14} /> Approval limits
            </button>
          )}
          {canSubmit && (
            <button onClick={() => { setForm({ ...EMPTY, church_id: isGlobal && branch !== 'all' ? branch : '' }); setShowForm(true); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-xs transition-all">
              <Plus size={14} /> New request
            </button>
          )}
        </div>
      </div>

      {/* Approval limits (Pastor) */}
      {isPastor && showLimits && (
        <div className={`${t.cardBg} border ${t.cardBorder} rounded-2xl p-5`}>
          <p className={`text-xs ${t.textSub} mb-4`}>
            Requests above a branch&apos;s limit need the Pastor and one Elder (love gifts: two Elders). Changing a limit
            only affects new requests.
          </p>
          <div className="space-y-2">
            {churches.map((c) => (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className={`text-sm font-semibold ${t.textPrimary} sm:w-56`}>{c.name}</span>
                <input type="number" min="1" step="0.01"
                  value={limitDraft[c.id] ?? limits[c.id] ?? ''}
                  onChange={(e) => setLimitDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                  onWheel={(e) => e.target.blur()}
                  className={`${input} sm:w-40`} />
                <button onClick={() => saveLimit(c.id)}
                  disabled={limitDraft[c.id] === undefined || Number(limitDraft[c.id]) === limits[c.id]}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 w-fit">
                  Save
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className={`flex items-center justify-center gap-2 py-14 ${t.textMuted} text-sm`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading requests...
        </div>
      ) : shown.length === 0 ? (
        <div className={`py-14 text-center border border-dashed ${t.cardBorder} rounded-3xl`}>
          <HandCoins className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
          <p className={`${t.textMuted} text-sm`}>No requests here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const apps = approvals[r.id] || [];
            const mine = r.requested_by === userId;
            const busy = busyId === r.id;
            return (
              <div key={r.id} className={`${t.cardBg} border ${t.cardBorder} rounded-2xl p-5`}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${t.textSub}`}>{r.category}</span>
                      <span className={`text-[10px] ${t.textMuted}`}>#{r.id}</span>
                    </div>
                    <p className={`text-base font-bold ${t.textPrimary}`}>{r.title}</p>
                    {r.description && <p className={`text-xs ${t.textSub} mt-1 whitespace-pre-line`}>{r.description}</p>}
                    <p className={`text-xs ${t.textMuted} mt-2`}>
                      By {mine ? 'you' : (r.requester_name || 'someone')} · {shortDate(r.created_at)}
                      {isGlobal && churchName(r.church_id) && <> · {churchName(r.church_id)}</>}
                    </p>
                  </div>
                  <p className={`text-xl font-black font-mono ${t.textPrimary} shrink-0`}>{peso(r.amount)}</p>
                </div>

                <div className={`mt-4 pt-3 border-t ${t.divider} text-xs space-y-1.5`}>
                  <p className={t.textSub}>
                    Needs <span className={`font-bold ${t.textPrimary}`}>{ruleText(r)}</span>
                    {r.approval_limit && <span className={t.textMuted}> (limit {peso(r.approval_limit)})</span>}
                  </p>
                  {apps.map((a) => (
                    <p key={a.id} className={a.decision === 'approve' ? (dark ? 'text-emerald-400' : 'text-emerald-600') : (dark ? 'text-rose-400' : 'text-rose-600')}>
                      {a.decision === 'approve' ? '✓ Approved' : '✕ Rejected'} by {a.approver_name || 'someone'}
                      {a.approver_role === 'pastor' ? ' (Pastor)' : a.approver_is_elder ? ' (Elder)' : ' (Leader)'}
                      {' · '}{shortDate(a.created_at)}
                      {a.note && <span className={t.textSub}> — “{a.note}”</span>}
                    </p>
                  ))}
                  {r.status === 'released' && (
                    <p className={dark ? 'text-emerald-400' : 'text-emerald-600'}>Released {shortDate(r.released_at)} — recorded in the ledger.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-4 empty:hidden">
                  {canDecide[r.id] && (
                    <>
                      <button onClick={() => openDecision(r, 'approve')} disabled={busy}
                        className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-4 py-2 rounded-xl disabled:opacity-50">
                        <Check size={14} /> Approve
                      </button>
                      <button onClick={() => openDecision(r, 'reject')} disabled={busy}
                        className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-4 py-2 rounded-xl disabled:opacity-50">
                        <X size={14} /> Reject
                      </button>
                    </>
                  )}
                  {mine && r.status === 'pending' && (
                    <button onClick={() => cancelRequest(r)} disabled={busy}
                      className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl border ${t.iconBtn} disabled:opacity-50`}>
                      <Ban size={14} /> Cancel request
                    </button>
                  )}
                  {canRelease && r.status === 'approved' && (
                    <button onClick={() => release(r)} disabled={busy}
                      className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl disabled:opacity-50">
                      <HandCoins size={14} /> {busy ? 'Releasing...' : 'Mark released'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve / reject */}
      {deciding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4`}>
            <h2 className={`text-lg font-black ${t.textPrimary} mb-1`}>
              {deciding.decision === 'approve' ? 'Approve request' : 'Reject request'}
            </h2>
            <p className={`text-sm ${t.textSub} mb-4`}>
              &ldquo;{deciding.request.title}&rdquo; · <span className={`font-bold ${t.textPrimary}`}>{peso(deciding.request.amount)}</span>
            </p>
            <Label t={t} text={deciding.decision === 'approve' ? 'Note (optional)' : 'Reason (required)'}>
              <textarea rows={3} value={note} autoFocus
                onChange={(e) => { setNote(e.target.value); setNoteError(''); }}
                placeholder={deciding.decision === 'approve' ? 'e.g. Go ahead, buy from the usual store' : 'e.g. Please get a second quotation first'}
                className={`${input} resize-none`} />
            </Label>
            {noteError && <p className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{noteError}</p>}
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setDeciding(null)} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold`}>Cancel</button>
              <button type="button" onClick={confirmDecision} disabled={busyId === deciding.request.id}
                className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                  deciding.decision === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'}`}>
                {busyId === deciding.request.id ? 'Saving...' : deciding.decision === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New request */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-center mb-5">
              <h2 className={`text-lg font-black ${t.textPrimary}`}>New spending request</h2>
              <button onClick={() => setShowForm(false)} className={`${t.textSub} hover:text-blue-400`}><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              {isPastor && (
                <Label t={t} text="Branch">
                  <select value={form.church_id} onChange={(e) => setForm({ ...form, church_id: e.target.value })} className={input}>
                    <option value="">Choose a branch</option>
                    {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Label>
              )}
              <Label t={t} text="What is it for?">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Guitar strings for Sunday service" className={input} />
              </Label>
              <Label t={t} text="Category">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>
                  {REQUEST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Label>
              <Label t={t} text="Amount (₱)">
                <input type="number" min="0.01" step="0.01" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  onWheel={(e) => e.target.blur()} placeholder="e.g. 3000" className={input} />
              </Label>
              <Label t={t} text="Details (optional)">
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Why it's needed, where it will be bought..." className={`${input} resize-none`} />
              </Label>
              {Number(form.amount) > 0 && (
                <p className={`text-xs ${t.textSub} ${t.inputBg} border ${t.inputBorder} rounded-xl px-4 py-3`}>
                  This will need <span className={`font-bold ${t.textPrimary}`}>
                    {ruleFor({ category: form.category, amount: form.amount, limit: formLimit, byPastor: isPastor })}
                  </span>.
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold`}>Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold">
                  {saving ? 'Submitting...' : 'Submit request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ t, text, children }) {
  return (
    <div>
      <label className={`block text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1.5`}>{text}</label>
      {children}
    </div>
  );
}
