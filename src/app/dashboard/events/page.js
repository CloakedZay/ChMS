'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import { useAuth } from "@/app/context/AuthContext";
import { can } from "@/app/lib/permissions";
import { notifyEventsChanged } from "@/app/lib/useEventNotices";
import {
  Calendar, Plus, Search, MoreHorizontal,
  CheckCircle2, CircleDot, X, Trash2, Pencil, CalendarDays, Sun, Moon, ClipboardCheck, Undo2, Send, Check, MapPin, Repeat, ArrowLeft, Ban, RotateCcw, LayoutGrid
} from "lucide-react";
import { formatEventTime } from "@/app/lib/eventTime";
import { phToday } from "@/app/lib/phDate";
import DatePicker from "@/app/components/DatePicker";
import TimePicker from "@/app/components/TimePicker";
import { weeklyDates, lastSeriesDate, weekdayOf, groupSeries, collapseSeries, seriesLabel, MAX_SERIES_DATES } from "@/app/lib/eventSeries";
import BranchLabel from "@/app/components/BranchLabel";
import EventCalendar from "@/app/components/EventCalendar";

import Pagination, { usePaged } from "@/app/components/Pagination";
import { alertDialog, confirmDialog } from "@/app/lib/dialog";
import { friendlyError } from '@/app/lib/errors';
const EMPTY_FORM = {
  title: '',
  date: '',
  start_time: '',
  venue: '',
  status: 'planning',
  description: '',
  church_id: '',
  repeat: 'none',     // 'none' | 'weekly' (db/049) — new events only
  until: '',
};

const shortDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

const STATUS_COLORS = {
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  pending:  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  planning: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  done:     "bg-slate-500/10 text-slate-400 border-slate-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
};

const FILTERS = ["all", "planning", "pending", "approved", "done", "cancelled"];

// Short level names for "Added by … (Secretary)".
const LEVEL = { admin: 'Admin', pastor: 'Pastor', leader: 'Leader', secretary: 'Secretary', finance: 'Finance' };
const GLOBAL_ROLES = ["admin", "pastor"];
// The Secretary may still edit their own event while it's in one of these;
// approving is a Leader's job (db/050).
const SUBMITTED_STATUSES = ["planning", "pending"];

// ─── Theme token map — same pattern as DashboardPage.js ────────────────────
// Light mode is deliberately dimmed a notch off pure white/slate-100 (~90%
// as bright) so it doesn't glare next to the dark theme.
function T(dark) {
  return {
    pageBg:      dark ? "bg-[#111815]"        : "bg-slate-200",
    cardBg:      dark ? "bg-[#1b2420]/50"     : "bg-slate-100/90",
    cardBorder:  dark ? "border-slate-800/60"  : "border-slate-300",
    textPrimary: dark ? "text-white"           : "text-slate-900",
    textSub:     dark ? "text-slate-500"       : "text-slate-600",
    textMuted:   dark ? "text-slate-600"       : "text-slate-500",
    inputBg:     dark ? "bg-[#1b2420]"        : "bg-slate-50",
    inputBorder: dark ? "border-slate-800"     : "border-slate-400",
    inputText:   dark ? "text-slate-200"       : "text-slate-800",
    divider:     dark ? "border-slate-800/50"  : "border-slate-300",
    filterInactive: dark ? "bg-[#1b2420] border-slate-800 text-slate-500 hover:text-slate-200" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
    modalBg:     dark ? "bg-[#1b2420]"        : "bg-slate-50",
    modalBorder: dark ? "border-slate-700"     : "border-slate-300",
    cancelBtn:   dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-300 hover:bg-slate-400 text-slate-900",
    emptyIcon:   dark ? "text-slate-700"       : "text-slate-400",
    menuBg:      dark ? "bg-[#1b2420] border-slate-700" : "bg-slate-50 border-slate-300",
    menuHover:   dark ? "hover:bg-slate-800"    : "hover:bg-slate-200",
    iconBtn:     dark ? "bg-[#1b2420] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
  };
}

// Accent color for content text — the -400 shades read fine on the dark bg
// but are too pale for contrast on light.
const ACCENT = {
  blue:    { dark: "text-blue-400",    light: "text-blue-600" },
  emerald: { dark: "text-emerald-400", light: "text-emerald-600" },
  orange:  { dark: "text-orange-400",  light: "text-orange-600" },
};
function A(dark, color) {
  return dark ? ACCENT[color].dark : ACCENT[color].light;
}

export default function EventsPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);
  const { user, role } = useAuth();

  const [events, setEvents]         = useState([]);
  const [churches, setChurches]     = useState([]);
  const [profile, setProfile]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [search, setSearch]         = useState("");
  // ?filter=pending (from the dashboard bell) opens on that tab.
  const [activeFilter, setActiveFilter] = useState(() => {
    const f = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('filter') : null;
    return FILTERS.includes(f) ? f : 'all';
  });
  const [sendBack, setSendBack]     = useState(null);   // event being sent back
  const [backNote, setBackNote]     = useState("");
  const [acting, setActing]         = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [applyLater, setApplyLater] = useState(false);  // edit: also the series' later dates
  const [seriesView, setSeriesView] = useState(null);   // series_id: show all its dates
  // Cards or month calendar; remembered on this browser (read after load).
  const [view, setView] = useState('cards');
  const [selectedId, setSelectedId] = useState(null);   // event opened from the calendar
  const [toDelete, setToDelete]     = useState(null);   // { event, later, counts }
  const [cancelFor, setCancelFor]   = useState(null);   // event being cancelled (db/051)
  const [cancelNote, setCancelNote] = useState("");
  const [people, setPeople]         = useState({});     // login id → { full_name, email, role }

  const isGlobal = profile && GLOBAL_ROLES.includes(profile.role);
  const today = phToday();

  // db/050: Leaders add events (approved on save), approve the Secretary's
  // and manage every event of their branch. The Secretary adds events for a
  // Leader to approve and edits their own until then. The Pastor, Admin and
  // everyone else only view. Anyone who adds events may give a past date.
  const canManageAll = can(role, 'events', 'approve');
  const canSubmit    = can(role, 'events', 'submit');
  const canSeeAttendance = can(role, 'attendance', 'view');   // db/041
  // A branch with no Leader: the Pastor approves or sends back its pending
  // events instead (db/066).
  const [noLeader, setNoLeader] = useState(new Set());
  const pastorReviews = (ev) => role === 'pastor' && ev.status === 'pending' && noLeader.has(ev.church_id);
  const canEditEvent = (ev) =>
    canManageAll ||
    (canSubmit && ev.created_by === user?.id && SUBMITTED_STATUSES.includes(ev.status));

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('role, church_id')
      .eq('id', user.id)
      .single();
    if (error) { console.error('Error fetching profile:', error.message); return null; }
    setProfile(data);
    return data;
  }

  async function fetchChurches() {
    const { data, error } = await supabase.from('churches').select('id, name').order('name', { ascending: true });
    if (error) { console.error('Error fetching churches:', error.message); return; }
    if (data) setChurches(data);
  }

  async function fetchEvents() {
    setLoading(true);
    await supabase.rpc('complete_past_events');   // approved + date passed → done (db/042)
    const { data } = await supabase.from('events').select('*').order('date', { ascending: true });
    if (data) setEvents(data);
    setLoading(false);
    // Names for "Added by / Approved by / Cancelled by".
    const ids = [...new Set((data || []).flatMap((e) => [e.created_by, e.approved_by, e.cancelled_by]).filter(Boolean))];
    if (ids.length) {
      const { data: logins } = await supabase.from('profiles').select('id, full_name, email, role').in('id', ids);
      setPeople(Object.fromEntries((logins || []).map((p) => [p.id, p])));
    }
  }

  useEffect(() => {
    async function init() {
      const p = await fetchProfile();
      if (p?.role === 'pastor') {
        const { data: leaderless } = await supabase.rpc('branches_without_leader');   // empty before db/066
        setNoLeader(new Set(leaderless || []));
      }
      try { if (localStorage.getItem('faithsync-events-view') === 'calendar') setView('calendar'); } catch { /* storage blocked */ }
      await fetchChurches();
      await fetchEvents();
      if (p && !GLOBAL_ROLES.includes(p.role)) {
        setForm((f) => ({ ...f, church_id: p.church_id || '' }));
      }
    }
    init();
  }, []);

  function openAdd() {
    setEditingEvent(null);
    setForm({ ...EMPTY_FORM, church_id: isGlobal ? '' : (profile?.church_id || '') });
    setShowModal(true);
  }

  function openEdit(event) {
    setEditingEvent(event);
    setForm({
      title:       event.title       || '',
      date:        event.date        || '',
      start_time:  event.start_time?.slice(0, 5) || '',
      venue:       event.venue       || '',
      status:      event.status      || 'planning',
      description: event.description || '',
      church_id:   event.church_id   || '',
      repeat: 'none',
      until: '',
    });
    setApplyLater(false);
    setShowModal(true);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isGlobal && !form.church_id) {
      alertDialog('Please select which branch this event belongs to.');
      return;
    }
    if (!isGlobal && !profile?.church_id) {
      alertDialog('Your account has no branch yet, so you can’t add events. Ask the Admin to set your branch.');
      return;
    }
    const dates = !editingEvent && form.repeat === 'weekly' ? weeklyDates(form.date, form.until) : [form.date];
    if (!editingEvent && form.repeat === 'weekly' && dates.length < 2) {
      alertDialog('Pick an end date at least a week after the first date, or choose "Does not repeat".');
      return;
    }
    setSaving(true);
    const { start_time, venue, repeat: _repeat, until: _until, ...rest } = form;
    const payload = {
      ...rest,
      church_id: isGlobal ? form.church_id : profile?.church_id,
      // A Leader's events are approved on save; the Secretary's go straight
      // to the Leaders for approval (db/050).
      status: editingEvent ? editingEvent.status : canManageAll ? 'approved' : 'pending',
    };
    // Time and venue only when set (or being cleared), so events still save
    // before db/043 has been run.
    if (start_time || editingEvent?.start_time) payload.start_time = start_time || null;
    if (venue.trim() || editingEvent?.venue) payload.venue = venue.trim() || null;

    let error;
    if (editingEvent && applyLater && editingEvent.series_id) {
      // Everything but the date and status, for this date and the later ones.
      const { date, status: _status, ...shared } = payload;
      ({ error } = await supabase.from('events').update(shared)
        .eq('series_id', editingEvent.series_id).gte('date', editingEvent.date));
      if (!error && date !== editingEvent.date) {
        ({ error } = await supabase.from('events').update({ date }).eq('id', editingEvent.id));
      }
    } else if (editingEvent) {
      ({ error } = await supabase.from('events').update(payload).eq('id', editingEvent.id));
    } else {
      const series_id = dates.length > 1 ? crypto.randomUUID() : null;
      ({ error } = await supabase.from('events')
        .insert(dates.map((date) => ({ ...payload, date, ...(series_id ? { series_id } : {}) }))));
    }
    if (error) {
      const missing = /schema cache|does not exist|Could not find/i.test(error.message);
      alertDialog(missing && /series_id/.test(error.message)
        ? 'Repeating events need db/049_event_series.sql. Ask the administrator to run it.'
        : missing && /start_time|venue/.test(error.message)
          ? 'Time and venue need db/043_event_details.sql. Ask the administrator to run it, or clear those two fields for now.'
          : `Error ${editingEvent ? 'updating' : 'saving'} event: ${friendlyError(error)}`);
      setSaving(false);
      return;
    }
    if (!editingEvent) notifyEventsChanged();
    setSaving(false);
    setShowModal(false);
    setEditingEvent(null);
    setForm(EMPTY_FORM);
    await fetchEvents();
  }

  // ── Approval (db/042) ──────────────────────────────────────────────────
  // A weekly event (db/049) is decided as a whole: every date of the series
  // that is still in the same step as this one.
  const sameStep = (ev) => (ev.series_id
    ? events.filter((e) => e.series_id === ev.series_id && e.status === ev.status).map((e) => e.id)
    : [ev.id]);
  const datesNote = (ev) => {
    const n = sameStep(ev).length;
    return n > 1 ? ` (all ${n} dates)` : '';
  };

  // The Pastor's decision in a branch with no Leader (db/066).
  async function pastorReview(ev, approveIt, note) {
    setActing(true);
    const { error } = await supabase.rpc('pastor_review_events', { p_ids: sameStep(ev), p_approve: approveIt, p_note: note || null });
    setActing(false);
    if (error) { alertDialog(friendlyError(error)); return false; }
    await fetchEvents();
    notifyEventsChanged();
    return true;
  }

  async function setStatus(ev, changes) {
    setActing(true);
    const { error } = await supabase.from('events').update(changes).in('id', sameStep(ev));
    setActing(false);
    if (error) { alertDialog(friendlyError(error)); return false; }
    await fetchEvents();
    notifyEventsChanged();
    return true;
  }

  async function approve(ev) {
    if (!ev.date) { alertDialog(`Set the date of "${ev.title}" before approving it.`); openEdit(ev); return; }
    if (ev.series_id && !await confirmDialog(`Approve "${ev.title}"${datesNote(ev)}?`)) return;
    if (pastorReviews(ev)) pastorReview(ev, true);
    else setStatus(ev, { status: 'approved' });
  }

  async function confirmSendBack(e) {
    e.preventDefault();
    const done = pastorReviews(sendBack)
      ? await pastorReview(sendBack, false, backNote.trim())
      : await setStatus(sendBack, { status: 'planning', review_note: backNote.trim() });
    if (done) setSendBack(null);
  }

  async function submitForApproval(ev) {
    if (!await confirmDialog(`Send "${ev.title}"${datesNote(ev)} to the Leaders for approval?`)) return;
    setStatus(ev, { status: 'pending' });
  }

  // ── Delete: one date, or this date and the later ones of its series ─────
  async function openDelete(ev) {
    const later = ev.series_id
      ? events.filter((e) => e.series_id === ev.series_id && e.date >= ev.date).map((e) => e.id)
      : [ev.id];
    const count = async (ids) => {
      const head = { count: 'exact', head: true };
      const [m, v] = await Promise.all([
        supabase.from('event_attendance').select('event_id', head).in('event_id', ids),
        supabase.from('event_visitors').select('event_id', head).in('event_id', ids),
      ]);
      return { members: m.count || 0, visitors: v.count || 0 };
    };
    const [one, all] = await Promise.all([count([ev.id]), later.length > 1 ? count(later) : null]);
    setToDelete({ event: ev, later, scope: 'one', counts: { one, all: all || one } });
  }

  async function confirmDelete() {
    const { event, later, scope } = toDelete;
    setActing(true);
    const { error } = await supabase.from('events').delete().in('id', scope === 'all' ? later : [event.id]);
    setActing(false);
    if (error) { alertDialog('Error deleting event: ' + friendlyError(error)); return; }
    setToDelete(null);
    await fetchEvents();
    notifyEventsChanged();
  }

  // ── Cancel / restore (db/051): kept on the calendar, marked Cancelled ──
  async function confirmCancel(e) {
    e.preventDefault();
    setActing(true);
    const { error } = await supabase.from('events')
      .update({ status: 'cancelled', cancel_note: cancelNote.trim() || null }).eq('id', cancelFor.id);
    setActing(false);
    if (error) {
      alertDialog(/cancel_note|events_status_check|check constraint/i.test(error.message)
        ? 'Cancelling needs db/051_event_cancel_and_reminders.sql. Ask the administrator to run it.'
        : friendlyError(error));
      return;
    }
    setCancelFor(null);
    await fetchEvents();
    notifyEventsChanged();
  }

  async function restore(ev) {
    if (!await confirmDialog(`Restore "${ev.title}" on ${shortDate(ev.date)}? Members will see it as on again.`)) return;
    // Just this date (cancelling is per date too), not the whole series.
    setActing(true);
    const { error } = await supabase.from('events').update({ status: 'approved' }).eq('id', ev.id);
    setActing(false);
    if (error) { alertDialog(friendlyError(error)); return; }
    await fetchEvents();
    notifyEventsChanged();
  }

  // "Added by Maria (Secretary) · Approved by Juan (Leader)"
  function whoLine(ev) {
    const name = (id) => {
      const p = people[id];
      if (!p) return null;
      const n = p.full_name?.trim() || p.email?.split('@')[0] || 'someone';
      return LEVEL[p.role] ? `${n} (${LEVEL[p.role]})` : n;
    };
    const parts = [];
    if (name(ev.created_by)) parts.push(`Added by ${name(ev.created_by)}`);
    if (ev.approved_by && ev.approved_by !== ev.created_by && name(ev.approved_by)) parts.push(`Approved by ${name(ev.approved_by)}`);
    if (ev.status === 'cancelled' && name(ev.cancelled_by)) parts.push(`Cancelled by ${name(ev.cancelled_by)}`);
    return parts.join(' · ');
  }

  async function dismissReviews() {
    await supabase.rpc('mark_event_reviews_seen', { p_ids: null });
    await fetchEvents();
    notifyEventsChanged();
  }

  const churchName = (id) => churches.find((c) => c.id === id)?.name;

  const matching = events.filter((ev) => {
    const matchSearch = ev.title?.toLowerCase().includes(search.toLowerCase()) || ev.ministry?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = activeFilter === "all" || ev.status === activeFilter;
    return matchSearch && matchFilter && (!seriesView || ev.series_id === seriesView);
  });
  // A weekly event is one card (its next date) unless all its dates are open.
  const filtered = seriesView ? matching : groupSeries(matching, phToday());
  const viewedSeries = seriesView ? events.find((e) => e.series_id === seriesView) : null;

  // One line per weekly event, not per date.
  const waiting = collapseSeries(events.filter((e) => e.status === 'pending' && (canManageAll || pastorReviews(e))));
  const myReviews = collapseSeries(events.filter((e) => e.created_by === user?.id && e.review_seen === false));
  const withDates = (e) => (e.dates > 1 ? `${e.title} (${e.dates} dates)` : e.title);

  const counts = {
    total:    events.length,
    approved: events.filter((e) => e.status === "approved").length,
    pending:  events.filter((e) => e.status === "pending").length,
    done:     events.filter((e) => e.status === "done").length,
  };

  function switchView(v) {
    setView(v);
    try { localStorage.setItem('faithsync-events-view', v); } catch { /* storage blocked — fine */ }
  }

  // The same card, buttons included, in the list and when an event is
  // opened from the calendar (there it closes before another dialog opens).
  function cardProps(event, inModal = false) {
    const wrap = (fn) => (fn && inModal ? (...args) => { setSelectedId(null); fn(...args); } : fn);
    return {
      event,
      branchName: isGlobal ? churchName(event.church_id) : null,
      onEdit: wrap(canEditEvent(event) ? openEdit : null),
      onDelete: wrap(canEditEvent(event) ? openDelete : null),
      attendance: canSeeAttendance,
      onShowSeries: event.series ? wrap(() => { setSeriesView(event.series_id); switchView('cards'); }) : null,
      onApprove: wrap((canManageAll && (event.status === 'pending' || (event.status === 'planning' && event.created_by === user?.id))) || pastorReviews(event) ? approve : null),
      onSendBack: wrap((canManageAll && event.status === 'pending') || pastorReviews(event) ? (ev) => { setSendBack(ev); setBackNote(''); } : null),
      onSubmit: wrap(canSubmit && !canManageAll && event.created_by === user?.id && event.status === 'planning' ? submitForApproval : null),
      onCancel: wrap(canManageAll && event.status === 'approved' ? (ev) => { setCancelFor(ev); setCancelNote(''); } : null),
      onRestore: wrap(canManageAll && event.status === 'cancelled' ? restore : null),
      byline: whoLine(event),
      busy: acting, t, dark,
    };
  }

  // The event opened from the calendar, with its weekly series attached.
  const selected = (() => {
    const ev = events.find((e) => e.id === selectedId);
    if (!ev?.series_id) return ev || null;
    const dates = events.filter((e) => e.series_id === ev.series_id).map((e) => e.date).sort();
    return { ...ev, series: { count: dates.length, first: dates[0], last: dates[dates.length - 1] } };
  })();

  // Long lists are shown 9 at a time (components/Pagination).
  const pg = usePaged(filtered, 9, `${search}|${activeFilter}|${seriesView}`);

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} transition-colors duration-200`}>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}><BranchLabel /></p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Events & Services</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Schedule and track church activities and ministry projects</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0`}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {(canManageAll || canSubmit) && (
            <button
              onClick={openAdd}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-blue-900/20 shrink-0"
            >
              <Plus size={16} /> Add Event
            </button>
          )}
        </div>
      </div>

      {/* Leaders (and the Pastor, for branches with no Leader): events waiting for approval */}
      {waiting.length > 0 && activeFilter !== 'pending' && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-5 py-4">
          <p className={`text-sm ${t.textPrimary} flex-1`}>
            <b>{waiting.length} event{waiting.length === 1 ? '' : 's'}</b> waiting for your approval: {waiting.map(withDates).join(', ')}
          </p>
          <button onClick={() => setActiveFilter('pending')}
            className="shrink-0 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-xs font-bold">Review</button>
        </div>
      )}

      {/* Whoever filed events: the Leaders' decisions */}
      {myReviews.length > 0 && (
        <div className={`mb-6 rounded-2xl border ${t.cardBorder} ${t.cardBg} px-5 py-4`}>
          <ul className="space-y-2">
            {myReviews.map((e) => (
              <li key={e.id} className="text-sm flex items-start gap-2">
                {e.status === 'approved'
                  ? <CheckCircle2 size={16} className={`${A(dark, 'emerald')} shrink-0 mt-0.5`} />
                  : <Undo2 size={16} className={`${A(dark, 'orange')} shrink-0 mt-0.5`} />}
                <span className={t.textPrimary}>
                  <b>{withDates(e)}</b> {e.status === 'approved' ? 'was approved.' : 'was sent back to planning.'}
                  {e.status !== 'approved' && e.review_note && <span className={t.textSub}> Reason: “{e.review_note}”</span>}
                </span>
              </li>
            ))}
          </ul>
          <button onClick={dismissReviews} className={`mt-3 text-xs font-bold ${A(dark, 'blue')} hover:underline`}>Got it</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Events", value: counts.total,    color: A(dark, "blue") },
          { label: "Approved",     value: counts.approved, color: A(dark, "emerald") },
          { label: "Pending",      value: counts.pending,  color: A(dark, "orange") },
          { label: "Completed",    value: counts.done,     color: t.textMuted },
        ].map((c) => (
          <div key={c.label} className={`${t.cardBg} border ${t.cardBorder} rounded-2xl px-5 py-4 backdrop-blur-sm`}>
            <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1`}>{c.label}</p>
            <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-2.5 w-4 h-4 ${t.textSub}`} />
          <input
            type="text" placeholder="Search events or ministries..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 pl-9 pr-4 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${activeFilter === f ? "bg-blue-600 text-white" : t.filterInactive}`}>
              {f}
            </button>
          ))}
        </div>
        <div className={`flex gap-1 p-1 rounded-xl border ${t.cardBorder} ${t.cardBg} shrink-0 self-start`} role="tablist" aria-label="View">
          {[['cards', 'Cards', LayoutGrid], ['calendar', 'Calendar', CalendarDays]].map(([key, label, Icon]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => switchView(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${view === key ? 'bg-blue-600 text-white' : t.filterInactive.split(' ').filter((c) => c.startsWith('text-') || c.startsWith('hover:')).join(' ')}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {viewedSeries && (
        <div className={`mb-5 flex flex-wrap items-center gap-3 rounded-2xl border ${t.cardBorder} ${t.cardBg} px-5 py-3`}>
          <Repeat size={15} className={A(dark, 'blue')} />
          <p className={`text-sm ${t.textPrimary} flex-1`}>
            All dates of <b>{viewedSeries.title}</b> · every {weekdayOf(viewedSeries.date)}
          </p>
          <button onClick={() => setSeriesView(null)} className={`inline-flex items-center gap-1 text-xs font-bold ${A(dark, 'blue')} hover:underline`}>
            <ArrowLeft size={13} /> All events
          </button>
        </div>
      )}

      {loading ? (
        <p className={`${t.textMuted} text-center py-20 text-sm`}>Loading events...</p>
      ) : view === 'calendar' ? (
        // Every date (weekly events on each of their days), same filters.
        <EventCalendar events={matching} onSelect={(e) => setSelectedId(e.id)} dark={dark} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <CalendarDays className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
          <p className={`${t.textMuted} text-sm`}>{search || activeFilter !== "all" ? "No events match your search." : "No events yet. Add one!"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {pg.items.map((event) => (
            <EventCard key={event.id} {...cardProps(event)} />
          ))}
        </div>
      )}
      {!loading && view === 'cards' && <Pagination {...pg} label="events" />}

      {/* An event opened from the calendar: its card, with the usual buttons */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
          <div role="dialog" aria-modal="true" aria-label={selected.title} className="relative w-full max-w-md max-h-[90vh] overflow-y-auto">
            <button onClick={() => setSelectedId(null)} aria-label="Close"
              className="absolute -top-3 -right-1 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"><X size={16} /></button>
            <div className={`${t.modalBg} rounded-3xl`}>
              <EventCard {...cardProps(selected, true)} />
            </div>
          </div>
        </div>
      )}

      {toDelete && (() => {
        const { event, later, scope, counts } = toDelete;
        const c = scope === 'all' ? counts.all : counts.one;
        const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
        const who = [c.members && plural(c.members, 'member'), c.visitors && plural(c.visitors, 'visitor')].filter(Boolean).join(' and ');
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onMouseDown={(e) => { if (e.target === e.currentTarget && !acting) setToDelete(null); }}>
            <div role="dialog" aria-modal="true" aria-label="Delete event"
              className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4`}>
              <h2 className={`text-lg font-black ${t.textPrimary}`}>Delete “{event.title}”?</h2>
              {later.length > 1 && (
                <div className="mt-4 space-y-2">
                  {[
                    ['one', `Only ${shortDate(event.date)}`],
                    ['all', `${shortDate(event.date)} and the later dates (${later.length} in all)`],
                  ].map(([key, label]) => (
                    <label key={key} className={`flex items-center gap-2.5 text-sm ${t.textPrimary} cursor-pointer`}>
                      <input type="radio" name="delete-scope" checked={scope === key} onChange={() => setToDelete({ ...toDelete, scope: key })} className="accent-red-500" />
                      {label}
                    </label>
                  ))}
                </div>
              )}
              <p className={`text-xs ${t.textSub} mt-4`}>
                {who
                  ? <>Its attendance will be lost too: <b>{who}</b> marked present.{c.visitors ? ' The visitors themselves stay on the Follow-up page.' : ''} </>
                  : null}
                This can&apos;t be undone.
              </p>
              <div className="flex gap-3 pt-5">
                <button type="button" onClick={() => setToDelete(null)} disabled={acting} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold`}>Cancel</button>
                <button type="button" onClick={confirmDelete} disabled={acting}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold">
                  {acting ? 'Deleting…' : scope === 'all' ? `Delete ${later.length} dates` : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {cancelFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !acting) setCancelFor(null); }}>
          <form onSubmit={confirmCancel} role="dialog" aria-modal="true" aria-label="Cancel event"
            className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4`}>
            <h2 className={`text-lg font-black ${t.textPrimary}`}>Cancel “{cancelFor.title}”?</h2>
            <p className={`text-xs ${t.textSub} mt-1 mb-4`}>
              {shortDate(cancelFor.date)}. Members will still see it, marked <b>Cancelled</b>, with your reason. You can restore it later.
              {cancelFor.series_id && ' Only this date is cancelled; the other dates of the weekly event stay on.'}
            </p>
            <textarea value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={500} rows={3} autoFocus
              placeholder="Reason (optional) — e.g. Moved to next Sunday because of the typhoon."
              className={`${inputStyle(t)} resize-none`} />
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setCancelFor(null)} disabled={acting} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold`}>Keep it</button>
              <button type="submit" disabled={acting} className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold">
                {acting ? 'Cancelling…' : 'Cancel event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {sendBack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !acting) setSendBack(null); }}>
          <form onSubmit={confirmSendBack} role="dialog" aria-modal="true" aria-label="Send back"
            className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4`}>
            <h2 className={`text-lg font-black ${t.textPrimary}`}>Send back to planning</h2>
            <p className={`text-xs ${t.textSub} mt-1 mb-4`}>“{sendBack.title}” — tell them what to change. They&apos;ll see this, then they can fix it and submit again.</p>
            <textarea value={backNote} onChange={(e) => setBackNote(e.target.value)} required maxLength={1000} rows={4} autoFocus
              placeholder="e.g. Please move it to Saturday and add the venue."
              className={`${inputStyle(t)} resize-none`} />
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setSendBack(null)} disabled={acting} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold`}>Cancel</button>
              <button type="submit" disabled={acting || !backNote.trim()} className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold">
                {acting ? 'Sending…' : 'Send back'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-lg font-black ${t.textPrimary}`}>{editingEvent ? "Edit Event" : "Add New Event"}</h2>
              <button onClick={() => setShowModal(false)} className={`${t.textSub} hover:text-blue-400 transition-colors`}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Event Title" required t={t}>
                <input type="text" name="title" value={form.title} onChange={handleChange} required placeholder="e.g. Youth Prayer Night" className={inputStyle(t)} />
              </Field>

              {isGlobal && (
                <Field label="Branch" required t={t}>
                  <select name="church_id" value={form.church_id} onChange={handleChange} className={inputStyle(t)}>
                    <option value="">Select a branch</option>
                    {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" required t={t}>
                  {/* Past dates are allowed: to record an event that already happened. */}
                  <DatePicker name="date" value={form.date} onChange={handleChange} required ariaLabel="Date"
                    className={inputStyle(t)} />
                </Field>
                <Field label="Start time" t={t}>
                  <TimePicker name="start_time" value={form.start_time} onChange={handleChange} ariaLabel="Start time" className={inputStyle(t)} />
                </Field>
              </div>
              {!editingEvent && form.date && form.date < today && (
                <p className={`text-[11px] -mt-2 ${A(dark, 'orange')}`}>This date has passed — adding it to record attendance for an event that already happened.</p>
              )}

              {/* Weekly events (db/049): one event per date, kept together. */}
              {!editingEvent && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Repeats" t={t}>
                    <select name="repeat" value={form.repeat} onChange={handleChange} className={inputStyle(t)}>
                      <option value="none">Does not repeat</option>
                      <option value="weekly">{form.date ? `Every ${weekdayOf(form.date)}` : 'Every week'}</option>
                    </select>
                  </Field>
                  {form.repeat === 'weekly' && (
                    <Field label="Until" required t={t}>
                      <DatePicker name="until" value={form.until} onChange={handleChange} required ariaLabel="Until"
                        min={form.date || undefined} max={lastSeriesDate(form.date) || undefined} className={inputStyle(t)} />
                    </Field>
                  )}
                </div>
              )}
              {!editingEvent && form.repeat === 'weekly' && form.date && form.until && (() => {
                const n = weeklyDates(form.date, form.until).length;
                return (
                  <p className={`text-[11px] -mt-2 ${t.textSub}`}>
                    {n} dates, every {weekdayOf(form.date)} from {shortDate(form.date)}. Each date gets its own attendance sheet.
                    {n === MAX_SERIES_DATES && ` That's the most at once (a year); add another series later.`}
                  </p>
                );
              })()}
              {editingEvent?.series_id && (
                <label className={`flex items-start gap-2.5 text-xs ${t.textSub} cursor-pointer`}>
                  <input type="checkbox" checked={applyLater} onChange={(e) => setApplyLater(e.target.checked)} className="mt-0.5 accent-blue-600" />
                  <span>
                    <span className={`font-bold ${t.textPrimary}`}>Also change the later dates</span> — title, time, venue
                    and description for {shortDate(editingEvent.date)} and every later date of this weekly event. The date itself changes only here.
                  </span>
                </label>
              )}

              <Field label="Venue" t={t}>
                <input type="text" name="venue" value={form.venue} onChange={handleChange} maxLength={200} placeholder="e.g. Main Sanctuary" className={inputStyle(t)} />
              </Field>

              <Field label="Description" t={t}>
                <textarea name="description" value={form.description} onChange={handleChange} placeholder="Optional notes about this event..." rows={3} className={`${inputStyle(t)} resize-none`} />
              </Field>

              {!editingEvent && (
                <p className={`text-[11px] ${t.textSub}`}>
                  {canManageAll
                    ? <>Your events are <b>Approved</b> as soon as you save them, and members see them right away.</>
                    : <>It goes to the <b>Leaders</b> for approval when you save it. You can still change it until they approve it.</>}
                </p>
              )}
              {editingEvent?.status === 'planning' && canSubmit && !canManageAll && (
                <p className={`text-[11px] ${A(dark, 'orange')}`}>
                  This event was sent back. After saving your changes, press <b>Submit for approval</b> on its card to send it to the Leaders again.
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold transition-all`}>Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                  {saving ? 'Saving...' : editingEvent ? 'Save Changes' : 'Add Event'}
                </button>
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


function EventCard({ event, branchName, onEdit, onDelete, onShowSeries, onCancel, onRestore, byline, attendance, onApprove, onSendBack, onSubmit, busy, t, dark }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const phase = event.status || "planning";
  const cancelled = phase === 'cancelled';

  const steps = [
    { key: "planning", label: "Planning", Icon: CircleDot },
    { key: "approved", label: "Approved", Icon: CircleDot },
    { key: "done",     label: "Done",     Icon: CheckCircle2 },
  ];
  const stepIndex = ["planning", "pending", "approved", "done"].indexOf(phase);

  return (
    <div className={`${t.cardBg} border ${t.cardBorder} p-6 rounded-3xl backdrop-blur-sm hover:border-blue-500/40 transition-all group relative`}>
      <div className="flex justify-between items-start mb-4">
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[phase] || STATUS_COLORS.planning}`}>{phase}</span>
        {(onEdit || onDelete || onCancel || onRestore) && <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className={`${t.textMuted} hover:text-blue-400 transition-colors p-1 rounded-lg ${t.menuHover}`}><MoreHorizontal size={16} /></button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className={`absolute right-0 top-8 z-20 ${t.menuBg} border rounded-xl shadow-xl w-40 overflow-hidden`}>
                {onEdit && <button onClick={() => { setMenuOpen(false); onEdit(event); }} className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textSub} ${t.menuHover} transition-colors`}><Pencil size={13} /> Edit</button>}
                {onCancel && <button onClick={() => { setMenuOpen(false); onCancel(event); }} className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textSub} ${t.menuHover} transition-colors`}><Ban size={13} /> Cancel event</button>}
                {onRestore && <button onClick={() => { setMenuOpen(false); onRestore(event); }} className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textSub} ${t.menuHover} transition-colors`}><RotateCcw size={13} /> Restore</button>}
                {onDelete && <button onClick={() => { setMenuOpen(false); onDelete(event); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={13} /> Delete</button>}
              </div>
            </>
          )}
        </div>}
      </div>

      <h3 className={`text-base font-black ${t.textPrimary} mb-1 group-hover:text-blue-400 transition-colors leading-snug ${cancelled ? 'line-through opacity-60' : ''}`}>{event.title}</h3>
      {/* Older events may still name a ministry (new ones don't, db/050). */}
      {event.ministry && <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-1">{event.ministry}</p>}
      {branchName ? <p className={`${t.textMuted} text-[10px] font-bold uppercase tracking-wider mb-4`}>{branchName}</p> : <div className="mb-4" />}

      <div className="space-y-2 mb-6">
        <div className={`flex items-center gap-2 ${t.textSub}`}>
          <Calendar size={13} className={`${t.textMuted} shrink-0`} />
          <span className="text-xs">
            {event.date ? new Date(event.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No date set'}
            {event.start_time && ` · ${formatEventTime(event.start_time)}`}
          </span>
        </div>
        {event.venue && (
          <div className={`flex items-center gap-2 ${t.textSub}`}>
            <MapPin size={13} className={`${t.textMuted} shrink-0`} />
            <span className="text-xs truncate">{event.venue}</span>
          </div>
        )}
        {event.series && (
          <div className={`flex items-center gap-2 ${t.textSub}`}>
            <Repeat size={13} className={`${t.textMuted} shrink-0`} />
            <span className="text-xs">
              {seriesLabel(event)}
              {onShowSeries && (
                <> · <button onClick={onShowSeries} className={`font-semibold ${A(dark, 'blue')} hover:underline`}>all {event.series.count} dates</button></>
              )}
            </span>
          </div>
        )}
        {event.description && <p className={`text-xs ${t.textMuted} leading-relaxed line-clamp-2`}>{event.description}</p>}
        {cancelled && (
          <p className={`text-xs rounded-xl px-3 py-2 bg-red-500/10 border border-red-500/20 ${t.textSub}`}>
            <span className="font-bold text-red-400">Cancelled{event.cancel_note ? ':' : ''}</span> {event.cancel_note}
          </p>
        )}
        {byline && <p className={`text-[11px] ${t.textMuted}`}>{byline}</p>}
        {phase === 'planning' && event.review_note && (
          <p className={`text-xs rounded-xl px-3 py-2 bg-orange-500/10 border border-orange-500/20 ${t.textSub}`}>
            <span className={`font-bold ${A(dark, 'orange')}`}>Sent back:</span> {event.review_note}
          </p>
        )}
      </div>

      {(onApprove || onSendBack || onSubmit) && (
        <div className="flex gap-2 mb-5">
          {onApprove && (
            <button onClick={() => onApprove(event)} disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold">
              <Check size={14} /> Approve
            </button>
          )}
          {onSendBack && (
            <button onClick={() => onSendBack(event)} disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-orange-500/30 text-orange-500 hover:bg-orange-500/10 disabled:opacity-50 text-xs font-bold">
              <Undo2 size={14} /> Send back
            </button>
          )}
          {onSubmit && (
            <button onClick={() => onSubmit(event)} disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold">
              <Send size={13} /> Submit for approval
            </button>
          )}
        </div>
      )}

      <div className={`pt-4 border-t ${t.divider}`}>
        {cancelled ? (
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400"><Ban size={12} /> Cancelled — no attendance</p>
        ) : <div className="flex items-center justify-between">
          {steps.map((step, i) => {
            const reached = stepIndex >= ["planning", "pending", "approved", "done"].indexOf(step.key === "approved" ? "approved" : step.key);
            return (
              <div key={step.key} className="flex items-center gap-1">
                <step.Icon size={12} className={reached ? (step.key === "done" ? A(dark, "emerald") : A(dark, "blue")) : (dark ? "text-slate-700" : "text-slate-400")} />
                <span className={`text-[9px] font-bold uppercase tracking-wider ${reached ? t.textSub : t.emptyIcon}`}>{step.label}</span>
                {i < steps.length - 1 && <div className={`w-6 h-px mx-1 ${stepIndex > i ? "bg-blue-500/40" : (dark ? "bg-slate-800" : "bg-slate-300")}`} />}
              </div>
            );
          })}
        </div>}
        {/* Attendance opens on the event's date (Philippine time) once it's approved. */}
        {attendance && ['approved', 'done'].includes(phase) && event.date && event.date <= phToday() && (
          <Link href={`/dashboard/attendance?event=${event.id}`}
            className="mt-4 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors">
            <ClipboardCheck size={13} /> Attendance
          </Link>
        )}
      </div>
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