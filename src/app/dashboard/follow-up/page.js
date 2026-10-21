'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  HeartHandshake, Search, UserX, Clock, CheckCircle2, KeyRound, X, Loader2, ChevronDown, ChevronUp, MessageSquarePlus,
  Phone, MessageSquare, UserPlus, Trash2,
} from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { can, GLOBAL_ROLES } from '@/app/lib/permissions';
import { levelBadge } from '@/app/lib/roleColors';
import BranchLabel from '@/app/components/BranchLabel';
import { notifyFollowUpChanged, MISSED_EVENTS } from '@/app/lib/useFollowUpReminder';

import Pagination, { usePaged } from '@/app/components/Pagination';
import { alertDialog, confirmDialog } from '@/app/lib/dialog';
import { friendlyError } from '@/app/lib/errors';
import { useDialog } from '@/app/lib/useDialog';
// Member inactivity and follow-up (db/032).
// "Last seen" = the later of a member's last sign-in and last page visit,
// for members whose record is linked to a login. A member is flagged when
// they haven't been seen for the chosen number of days, missed their last
// MISSED_EVENTS events in a row (db/046 — works without a login too), or
// the Secretary has marked them inactive. Logging a follow-up clears the
// flag for that many days.

const THRESHOLDS = [7, 14, 30, 60, 90];
const OUTCOMES = {
  contacted:     { label: 'Contacted',        cls: 'bg-blue-500/15 text-blue-500' },
  no_answer:     { label: 'No answer',        cls: 'bg-orange-500/15 text-orange-500' },
  visited:       { label: 'Visited',          cls: 'bg-emerald-500/15 text-emerald-500' },
  returned:      { label: 'Came back',        cls: 'bg-emerald-500/15 text-emerald-500' },
  not_returning: { label: 'Not returning',    cls: 'bg-rose-500/15 text-rose-500' },
  other:         { label: 'Other',            cls: 'bg-slate-500/15 text-slate-500' },
};
const STATUS_STYLE = {
  active:   'bg-emerald-500/10 text-emerald-500 border-emerald-500/25',
  busy:     'bg-orange-500/10 text-orange-500 border-orange-500/25',
  inactive: 'bg-rose-500/10 text-rose-500 border-rose-500/25',
};

const DAY = 86400000;
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);
const ago = (iso) => {
  const d = daysSince(iso);
  if (d === null) return 'Never';
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 60) return `${d} days ago`;
  return `${Math.round(d / 30)} months ago`;
};
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
// A timestamp's date in the Philippines, "YYYY-MM-DD" (to compare with event dates).
const manilaDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const eventDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

export default function FollowUpPage() {
  const { role } = useAuth();
  const { dark } = useTheme();
  const canChangeStatus = can(role, 'members', 'edit');   // the Secretary
  const canMakeMember = can(role, 'memberArchive', 'edit'); // Pastor, Secretary (db/041)

  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [threshold, setThreshold] = useState(30);
  const [tab, setTab] = useState('needs');
  const [search, setSearch] = useState('');
  const [openHistory, setOpenHistory] = useState(null);   // member id
  const [history, setHistory] = useState({});             // id → entries
  const [logFor, setLogFor] = useState(null);             // member row
  const [outcome, setOutcome] = useState('contacted');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [alsoActive, setAlsoActive] = useState(true);    // "Came back" → mark Active too
  const [visitors, setVisitors] = useState(null);         // db/041; [] if not set up
  // The Pastor sees every branch: which one to show, and their names.
  const isGlobal = GLOBAL_ROLES.includes(role);
  const [branch, setBranch] = useState('all');
  const [churches, setChurches] = useState([]);
  useEffect(() => {
    if (!isGlobal) return;
    supabase.from('churches').select('id, name').order('name').then(({ data }) => setChurches(data || []));
  }, [isGlobal]);
  const branchName = (id) => churches.find((c) => c.id === id)?.name || 'No branch';
  const inBranch = (cid) => branch === 'all' || cid === branch;
  // Branch shown on each row only when several branches are listed together.
  const showBranch = isGlobal && branch === 'all' && churches.length > 1;

  const t = dark
    ? { page: 'bg-[#111815]', card: 'bg-[#1b2420] border-slate-800/60', text: 'text-white', sub: 'text-slate-400', muted: 'text-slate-500',
        input: 'bg-[#111815] border-slate-700 text-slate-100 placeholder:text-slate-500', divider: 'border-slate-800',
        tabOn: 'bg-white/10 text-white', tabOff: 'text-slate-400 hover:text-white', ghost: 'border-slate-700 text-slate-300 hover:bg-white/5',
        inner: 'bg-[#111815]', modal: 'bg-[#1b2420] border-slate-800' }
    : { page: 'bg-[#f8f7f2]', card: 'bg-white border-[#e5e3d8]', text: 'text-[#173f35]', sub: 'text-[#4c534f]', muted: 'text-[#858b87]',
        input: 'bg-white border-[#d9d6c8] text-[#252a28] placeholder:text-[#858b87]', divider: 'border-[#efede4]',
        tabOn: 'bg-[#e8f0ea] text-[#173f35]', tabOff: 'text-[#858b87] hover:text-[#173f35]', ghost: 'border-[#d9d6c8] text-[#4c534f] hover:bg-[#f8f7f2]',
        inner: 'bg-[#f8f7f2]', modal: 'bg-white border-[#e5e3d8]' };

  // Visitors from event attendance sheets (db/041).
  async function loadVisitors() {
    const { data, error } = await supabase.rpc('visitor_list');
    setVisitors(error ? [] : data || []);
  }

  function applyActivity({ data, error }) {
    if (error) {
      setLoadError(/does not exist|schema cache|Could not find/i.test(error.message)
        ? 'Follow-up has not been set up yet. Ask the administrator to run db/032_member_followups.sql.'
        : friendlyError(error));
      setRows([]);
      return;
    }
    setLoadError('');
    setRows(data || []);
  }
  const load = () => supabase.rpc('member_activity').then(applyActivity);
  useEffect(() => { supabase.rpc('member_activity').then(applyActivity); }, []);
  useEffect(() => {
    supabase.rpc('visitor_list').then(({ data, error }) => setVisitors(error ? [] : data || []));
  }, []);

  async function makeMember(v) {
    // Already a member under that name (also archived ones)? Two people can
    // share a name, so ask rather than refuse — same as the Members page.
    const name = v.full_name.trim().replace(/\s+/g, ' ');
    const { data: twins } = await supabase.from('members').select('full_name, status, phone')
      .eq('church_id', v.church_id).ilike('full_name', name.replace(/[\\%_]/g, '\\$&'));
    const twin = twins?.[0];
    if (twin && !await confirmDialog({
      message: `There is already a member named "${twin.full_name}"${twin.status === 'archived' ? ' (archived — you can restore them on the Members page instead)' : ''}${twin.phone ? `, phone ${twin.phone}` : ''}. Is ${v.full_name} a different person?`,
      confirmText: 'Yes, different person',
    })) return;
    if (!await confirmDialog(`Add ${v.full_name} as a member? Their ${v.visits} visit${v.visits === 1 ? '' : 's'} will count as attendance, and they'll leave the visitor list.`)) return;
    const { error } = await supabase.rpc('make_visitor_member', { p_visitor: v.visitor_id });
    if (error) alertDialog(friendlyError(error)); else { load(); loadVisitors(); }
  }

  async function removeVisitor(v) {
    if (!await confirmDialog(`Delete ${v.full_name} and their phone number from the visitor list? Their visits are removed from the attendance counts too.`)) return;
    const { error } = await supabase.from('visitors').delete().eq('id', v.visitor_id);
    if (error) alertDialog(friendlyError(error)); else loadVisitors();
  }

  async function loadHistory(memberId) {
    const { data } = await supabase.rpc('member_followup_history', { mid: memberId });
    setHistory((h) => ({ ...h, [memberId]: data || [] }));
  }

  // Classify every member for the chosen threshold.
  const people = useMemo(() => (rows || []).filter((r) => branch === 'all' || r.church_id === branch).map((r) => {
    const away = daysSince(r.last_seen);
    const sinceFollowUp = daysSince(r.last_followup_at);
    // A login never used counts from when it was made (db/052), so new
    // logins aren't flagged before they've had a chance to sign in.
    const loginAge = daysSince(r.login_created_at);
    const quiet = r.has_login && (away !== null ? away >= threshold : loginAge === null || loginAge >= threshold);
    const missing = (r.missed_events ?? 0) >= MISSED_EVENTS;   // undefined before db/046
    // Latest follow-up "Not returning": rest until they show up again after it.
    const notReturning = r.last_outcome === 'not_returning'
      && !(r.last_seen && new Date(r.last_seen) > new Date(r.last_followup_at))
      && !(r.last_attended && r.last_attended > manilaDate(r.last_followup_at));
    // Busy = away on purpose; they aren't chased (db/059).
    const flagged = (quiet || missing || r.member_status === 'inactive') && !notReturning && r.member_status !== 'busy';
    const followedRecently = sinceFollowUp !== null && sinceFollowUp < threshold;
    return { ...r, away, quiet, missing, notReturning, flagged, followedRecently, needs: flagged && !followedRecently };
  }), [rows, threshold, branch]);

  const counts = {
    needs: people.filter((p) => p.needs).length,
    followed: people.filter((p) => p.flagged && p.followedRecently).length,
    notReturning: people.filter((p) => p.notReturning).length,
    noLogin: people.filter((p) => !p.has_login).length,
    all: people.length,
  };

  const q = search.trim().toLowerCase();
  const shown = people
    .filter((p) => (tab === 'needs' ? p.needs : tab === 'followed' ? p.flagged && p.followedRecently
      : tab === 'notReturning' ? p.notReturning : tab === 'noLogin' ? !p.has_login : true))
    .filter((p) => !q || p.full_name?.toLowerCase().includes(q))
    // longest away first; never-seen at the top
    .sort((a, b) => (b.away ?? Infinity) - (a.away ?? Infinity) || a.full_name.localeCompare(b.full_name));

  function openLog(p) { setLogFor(p); setOutcome('contacted'); setNote(''); setFormError(''); setAlsoActive(true); }
  // "Came back" for someone marked Inactive: offer to mark them Active too
  // (Pastor, Secretary — who may change status, db/006).
  const offerActive = logFor && outcome === 'returned' && logFor.member_status === 'inactive' && canMakeMember;

  async function saveLog(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const { error } = await supabase.from('member_followups')
      .insert([{ member_id: logFor.member_id, outcome, note: note.trim() || null }]);
    setSaving(false);
    if (error) { setFormError(friendlyError(error)); return; }
    if (offerActive && alsoActive) {
      const { error: e2 } = await supabase.from('members').update({ status: 'active' }).eq('id', logFor.member_id);
      if (e2) alertDialog(`The follow-up was saved, but ${logFor.full_name} couldn't be marked Active: ${friendlyError(e2)}`);
    }
    const id = logFor.member_id;
    setLogFor(null);
    notifyFollowUpChanged();
    await load();
    if (openHistory === id) loadHistory(id);
  }

  async function changeStatus(p, status) {
    if (status === p.member_status) return;
    if (!await confirmDialog(`Mark ${p.full_name} as ${status}?`)) return;
    const { error } = await supabase.from('members').update({ status }).eq('id', p.member_id);
    if (error) alertDialog(friendlyError(error)); else { load(); notifyFollowUpChanged(); }
  }

  function toggleHistory(id) {
    if (openHistory === id) { setOpenHistory(null); return; }
    setOpenHistory(id);
    loadHistory(id);
  }

  const branchVisitors = (visitors || []).filter((v) => inBranch(v.church_id));
  const TABS = [
    ['needs', 'Needs follow-up', counts.needs],
    ['followed', 'Followed up', counts.followed],
    ['notReturning', 'Not returning', counts.notReturning],
    ['noLogin', 'No login', counts.noLogin],
    ['all', 'All members', counts.all],
    ['visitors', 'Visitors', visitors ? branchVisitors.length : ''],
  ];
  const shownVisitors = branchVisitors.filter((v) => !q || v.full_name.toLowerCase().includes(q) || (v.phone || '').includes(q));

  // Long lists are shown 10 at a time (components/Pagination).
  const pg = usePaged(shown, 10, `${tab}|${search}|${threshold}|${branch}`);

  // Pop-ups: focus, Tab, Esc and a name for screen readers (lib/useDialog).
  const logDialogRef = useDialog(!!logFor, () => { if (!saving) setLogFor(null); });

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.page}`}>
      <div className="mb-8">
        <p className={`text-[10px] uppercase tracking-widest ${t.muted} mb-1`}><BranchLabel /></p>
        <h1 className={`text-2xl font-black ${t.text}`}>Member Follow-up</h1>
        <p className={`text-sm mt-1 ${t.sub} max-w-2xl`}>
          Members who haven&apos;t been active in FaithSync for a while, missed their last {MISSED_EVENTS} events, or are marked inactive.
          Reach out, then log how it went.
        </p>
      </div>

      {loadError && <p className="mb-6 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{loadError}</p>}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Need follow-up', value: counts.needs, icon: UserX, tone: 'text-rose-500 bg-rose-500/10' },
          { label: 'Followed up', value: counts.followed, icon: CheckCircle2, tone: 'text-emerald-500 bg-emerald-500/10' },
          { label: 'No login (app not tracked)', value: counts.noLogin, icon: KeyRound, tone: 'text-[#9c7f45] bg-[#c5a66a]/15' },
          { label: 'Members', value: counts.all, icon: HeartHandshake, tone: 'text-blue-500 bg-blue-500/10' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`border rounded-2xl p-4 ${t.card}`}>
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${tone}`}><Icon size={18} strokeWidth={1.75} /></span>
            <p className={`text-2xl font-black ${t.text}`}>{rows === null ? '…' : value}</p>
            <p className={`text-xs mt-0.5 ${t.muted}`}>{label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <div className={`flex gap-1 p-1 rounded-2xl border overflow-x-auto ${t.card}`} role="tablist">
          {TABS.map(([key, label, n]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`shrink-0 px-3.5 h-9 rounded-xl text-sm font-semibold ${tab === key ? t.tabOn : t.tabOff}`}>
              {label} <span className="opacity-60">{rows === null ? '' : n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 lg:ml-auto">
          {isGlobal && churches.length > 1 && (
            <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch"
              className={`border rounded-xl px-3 h-10 text-sm ${t.input}`}>
              <option value="all">All branches</option>
              {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {tab !== 'visitors' && <label className={`flex items-center gap-2 text-sm ${t.sub}`}>
            <Clock size={15} />
            <span className="whitespace-nowrap">Not seen in</span>
            <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} aria-label="Days without activity"
              className={`border rounded-xl px-3 h-10 text-sm ${t.input}`}>
              {THRESHOLDS.map((d) => <option key={d} value={d}>{d}+ days</option>)}
            </select>
          </label>}
          <div className="relative flex-1 lg:w-64">
            <Search size={15} className={`absolute left-3 top-3 ${t.muted}`} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === 'visitors' ? 'Search visitors' : 'Search members'} aria-label="Search"
              className={`w-full border rounded-xl pl-9 pr-3 h-10 text-sm ${t.input}`} />
          </div>
        </div>
      </div>

      {/* List */}
      {tab === 'visitors' ? (
        <VisitorList t={t} visitors={visitors === null ? null : shownVisitors} searching={!!q}
          branchOf={showBranch ? (v) => branchName(v.church_id) : null}
          canMakeMember={canMakeMember} onMakeMember={makeMember} onRemove={removeVisitor} />
      ) : rows === null ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20 w-full rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className={`border border-dashed rounded-3xl p-10 text-center ${t.card}`}>
          <span className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 size={26} strokeWidth={1.5} />
          </span>
          <p className={`font-bold ${t.text}`}>
            {q ? 'No members match your search.' : tab === 'needs' ? 'Everyone is accounted for' : 'Nobody here'}
          </p>
          {tab === 'needs' && !q && (
            <p className={`text-sm mt-1 ${t.sub}`}>No one has been away for {threshold}+ days or missed their last {MISSED_EVENTS} events without a recent follow-up.</p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {pg.items.map((p) => {
            const last = p.last_outcome ? OUTCOMES[p.last_outcome] : null;
            const isOpen = openHistory === p.member_id;
            return (
              <li key={p.member_id} className={`border rounded-2xl ${t.card}`}>
                <div className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`font-bold ${t.text}`}>{p.full_name}</p>
                      {showBranch && <span className={`text-[11px] font-semibold ${t.muted}`}>{branchName(p.church_id)}</span>}
                      {p.member_role && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${levelBadge(p.member_role, dark)}`}>{p.member_role}</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${STATUS_STYLE[p.member_status] || STATUS_STYLE.active}`}>{p.member_status}</span>
                    </div>
                    <p className={`text-xs mt-1 ${t.sub}`}>
                      {p.has_login
                        ? <>Last seen: <span className={`font-semibold ${p.quiet ? 'text-rose-500' : ''}`}>{ago(p.last_seen)}</span>
                            {!p.last_seen && p.login_created_at && <> (login created {ago(p.login_created_at).toLowerCase()})</>}</>
                        : <span className={t.muted}>No login — app activity isn&apos;t tracked</span>}
                      {p.missing
                        ? <> · <span className="font-semibold text-rose-500">Missed the last {p.missed_events} events</span>{p.last_attended ? ` (last came ${eventDate(p.last_attended)})` : ''}</>
                        : p.last_attended && <> · Last attended {eventDate(p.last_attended)}</>}
                      {last && (
                        <> · Last follow-up {ago(p.last_followup_at).toLowerCase()} by {p.last_by || 'someone'}{' '}
                          <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${last.cls}`}>{last.label}</span></>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canChangeStatus && (
                      <select value={p.member_status} onChange={(e) => changeStatus(p, e.target.value)} aria-label={`Status of ${p.full_name}`}
                        className={`border rounded-xl px-3 h-9 text-xs font-semibold ${t.input}`}>
                        <option value="active">Active</option>
                        <option value="busy">Busy</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    )}
                    <button onClick={() => toggleHistory(p.member_id)} aria-expanded={isOpen}
                      className={`inline-flex items-center gap-1 h-9 px-3 rounded-xl border text-xs font-semibold ${t.ghost}`}>
                      History ({p.followup_count}) {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => openLog(p)}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">
                      <MessageSquarePlus size={14} /> Log follow-up
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className={`border-t ${t.divider} px-4 py-3 ${t.inner} rounded-b-2xl`}>
                    {!history[p.member_id] ? (
                      <div className="skeleton h-10 w-full" />
                    ) : history[p.member_id].length === 0 ? (
                      <p className={`text-xs ${t.muted}`}>No follow-ups logged yet.</p>
                    ) : (
                      <ol className="space-y-3">
                        {history[p.member_id].map((h) => (
                          <li key={h.id} className="text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded-md font-semibold ${OUTCOMES[h.outcome]?.cls || OUTCOMES.other.cls}`}>
                                {OUTCOMES[h.outcome]?.label || h.outcome}
                              </span>
                              {/* Logged from Training → Member Progress (db/075) */}
                              {h.topic === 'training' && (
                                <span className="px-1.5 py-0.5 rounded-md font-semibold bg-indigo-500/15 text-indigo-500">Training</span>
                              )}
                              <span className={t.muted}>{shortDate(h.created_at)} · {h.by_name}</span>
                            </div>
                            {h.note && <p className={`mt-1 whitespace-pre-wrap ${t.sub}`}>{h.note}</p>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows !== null && tab !== 'visitors' && <Pagination {...pg} label="members" />}

      {/* Log a follow-up */}
      {logFor && (
        <div className="fixed inset-0 z-50 bg-[#0c1311]/60 flex items-end sm:items-center justify-center sm:p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setLogFor(null); }}>
          <form ref={logDialogRef} onSubmit={saveLog} role="dialog" aria-modal="true" aria-label="Log follow-up"
            className={`w-full sm:max-w-md border rounded-t-3xl sm:rounded-3xl p-6 shadow-xl ${t.modal}`}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className={`text-lg font-bold ${t.text}`}>Log follow-up</h2>
                <p className={`text-xs ${t.sub}`}>{logFor.full_name}</p>
              </div>
              <button type="button" onClick={() => setLogFor(null)} aria-label="Close"
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:bg-black/5`}><X size={18} /></button>
            </div>

            <p className={`text-xs font-semibold mb-2 ${t.sub}`}>How did it go?</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {Object.entries(OUTCOMES).map(([key, o]) => (
                <button key={key} type="button" onClick={() => setOutcome(key)} aria-pressed={outcome === key}
                  className={`h-10 rounded-xl border text-sm font-semibold ${outcome === key ? 'border-blue-600 bg-blue-600 text-white' : t.ghost}`}>
                  {o.label}
                </button>
              ))}
            </div>

            {offerActive && (
              <label className={`flex items-start gap-2.5 text-xs mb-4 cursor-pointer ${t.sub}`}>
                <input type="checkbox" checked={alsoActive} onChange={(e) => setAlsoActive(e.target.checked)} className="mt-0.5 accent-[#2f6b58]" />
                <span><span className={`font-semibold ${t.text}`}>Also mark {logFor.full_name} as Active</span> — they&apos;re marked Inactive now, and would be flagged again later.</span>
              </label>
            )}
            {outcome === 'not_returning' && (
              <p className={`text-xs mb-4 ${t.sub}`}>
                They won&apos;t be reminded about again and move to the <b>Not returning</b> tab — unless they sign in or attend an event after today.
              </p>
            )}

            <label htmlFor="fu-note" className={`block text-xs font-semibold mb-1.5 ${t.sub}`}>Note <span className="font-normal">(optional)</span></label>
            <textarea id="fu-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
              placeholder="e.g. Called — busy with work, will attend next Sunday."
              className={`w-full border rounded-xl px-4 py-2.5 text-sm resize-y ${t.input}`} />
            <p className={`text-[11px] mt-1.5 ${t.muted}`}>Visible to the Pastor, and to the Leaders and the Secretary of this branch. Members never see it.</p>

            {formError && <p className="mt-3 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{formError}</p>}

            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setLogFor(null)} disabled={saving}
                className={`flex-1 border rounded-xl h-11 text-sm font-semibold disabled:opacity-50 ${t.ghost}`}>Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl h-11 text-sm font-semibold">
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// Visitors written on event attendance sheets (db/041): call or text them,
// and add the ones who keep coming as members. Removed automatically
// 6 months after their last visit.
function VisitorList({ t, visitors, searching, branchOf, canMakeMember, onMakeMember, onRemove }) {
  if (visitors === null) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 w-full rounded-2xl" />)}</div>;
  }
  if (visitors.length === 0) {
    return (
      <div className={`border border-dashed rounded-3xl p-10 text-center ${t.card}`}>
        <p className={`font-bold ${t.text}`}>{searching ? 'No visitors match your search.' : 'No visitors yet'}</p>
        {!searching && <p className={`text-sm mt-1 ${t.sub}`}>Visitors added on an event&apos;s attendance sheet show up here for follow-up.</p>}
      </div>
    );
  }
  const date = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  const tel = (p) => (p || '').replace(/[^\d+]/g, '');
  return (
    <ul className="space-y-3">
      {visitors.map((v) => (
        <li key={v.visitor_id} className={`border rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-5 ${t.card}`}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`font-bold ${t.text}`}>{v.full_name}</p>
              {branchOf && <span className={`text-[11px] font-semibold ${t.muted}`}>{branchOf(v)}</span>}
              {v.visits <= 1
                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600">First-timer</span>
                : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500">{v.visits} visits</span>}
            </div>
            <p className={`text-xs mt-1 ${t.sub}`}>
              {v.phone || 'No phone number'} · Last visit {date(v.last_visit)}{v.last_event ? ` (${v.last_event})` : ''}
              {v.visits > 1 && ` · first ${date(v.first_visit)}`}
              {v.invited_by && ` · invited by ${v.invited_by}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {v.phone && (
              <>
                <a href={`tel:${tel(v.phone)}`} className={`inline-flex items-center gap-1 h-9 px-3 rounded-xl border text-xs font-semibold ${t.ghost}`}><Phone size={13} /> Call</a>
                <a href={`sms:${tel(v.phone)}`} className={`inline-flex items-center gap-1 h-9 px-3 rounded-xl border text-xs font-semibold ${t.ghost}`}><MessageSquare size={13} /> Text</a>
              </>
            )}
            {canMakeMember && (
              <button onClick={() => onMakeMember(v)}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">
                <UserPlus size={14} /> Make member
              </button>
            )}
            <button onClick={() => onRemove(v)} aria-label={`Delete ${v.full_name}`}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${t.ghost} hover:text-rose-500`}><Trash2 size={14} /></button>
          </div>
        </li>
      ))}
    </ul>
  );
}
