'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Search, UserPlus, X, Loader2, Users, UserRound, Phone, Lock } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { alertDialog, confirmDialog } from '@/app/lib/dialog';

// The attendance sheet of one event (db/041). People sign a paper sheet at
// the event; afterwards the Secretary or a helper ticks the members on it
// (the branch's whole member list is already here) and types in only the
// visitors. Every tick saves at once.

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const eventDate = (d) => (d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  : '');

export function attendanceTheme(dark) {
  return dark
    ? { card: 'bg-[#1b2420] border-slate-800/60', text: 'text-white', sub: 'text-slate-400', muted: 'text-slate-500',
        input: 'bg-[#111815] border-slate-700 text-slate-100 placeholder:text-slate-500', divider: 'border-slate-800',
        tabOn: 'bg-white/10 text-white', tabOff: 'text-slate-400 hover:text-white', ghost: 'border-slate-700 text-slate-300 hover:bg-white/5',
        row: 'border-slate-800 hover:bg-white/[0.03]', rowOn: 'border-blue-500/40 bg-blue-500/10', inner: 'bg-[#111815]' }
    : { card: 'bg-white border-[#e5e3d8]', text: 'text-[#173f35]', sub: 'text-[#4c534f]', muted: 'text-[#858b87]',
        input: 'bg-white border-[#d9d6c8] text-[#252a28] placeholder:text-[#858b87]', divider: 'border-[#efede4]',
        tabOn: 'bg-[#e8f0ea] text-[#173f35]', tabOff: 'text-[#858b87] hover:text-[#173f35]', ghost: 'border-[#d9d6c8] text-[#4c534f] hover:bg-[#f8f7f2]',
        row: 'border-[#efede4] hover:bg-[#f8f7f2]', rowOn: 'border-[#2f6b58]/40 bg-[#e8f0ea]', inner: 'bg-[#f8f7f2]' };
}

const missingSetup = (msg) => /does not exist|schema cache|Could not find/i.test(msg || '');

// Everything the sheet shows, in one go.
async function fetchSheet(eventId) {
  const [{ data: event }, { data: mark }, sheet, vis] = await Promise.all([
    supabase.from('events').select('id, title, ministry, date, status, church_id').eq('id', eventId).maybeSingle(),
    supabase.rpc('can_take_attendance', { p_event: eventId }),
    supabase.rpc('attendance_sheet', { p_event: eventId }),
    supabase.rpc('event_visitor_list', { p_event: eventId }),
  ]);
  if (sheet.error) {
    return {
      error: missingSetup(sheet.error.message)
        ? 'Attendance has not been set up yet. Ask the administrator to run db/041_event_attendance.sql.'
        : sheet.error.message,
    };
  }
  return { event, canMark: !!mark, people: sheet.data || [], visitors: vis.data || [] };
}

export default function AttendanceSheet({ eventId, dark, onBack }) {
  const t = attendanceTheme(dark);
  const [event, setEvent] = useState(null);
  const [canMark, setCanMark] = useState(false);
  const [people, setPeople] = useState(null);      // members of the branch
  const [visitors, setVisitors] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [show, setShow] = useState('all');          // all | present | unmarked
  const [busy, setBusy] = useState({});             // member id → saving

  function apply(r) {
    if (r.error) { setError(r.error); setPeople([]); return; }
    setEvent(r.event);
    setCanMark(r.canMark);
    setPeople(r.people);
    setVisitors(r.visitors);
  }
  const load = () => fetchSheet(eventId).then(apply);
  useEffect(() => {
    let gone = false;
    fetchSheet(eventId).then((r) => { if (!gone) apply(r); });
    return () => { gone = true; };
  }, [eventId]);

  async function mark(ids, present) {
    if (!canMark || !ids.length) return;
    setError('');
    setPeople((list) => list.map((p) => (ids.includes(p.member_id) ? { ...p, present } : p)));
    setBusy((b) => ({ ...b, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    const { error: e } = await supabase.rpc('set_attendance', { p_event: eventId, p_members: ids, p_present: present });
    setBusy((b) => { const n = { ...b }; ids.forEach((id) => delete n[id]); return n; });
    if (e) {
      setError(`Couldn't save: ${e.message}`);
      setPeople((list) => list.map((p) => (ids.includes(p.member_id) ? { ...p, present: !present } : p)));
    }
  }

  const ministry = event?.ministry || '';
  const presentCount = (people || []).filter((p) => p.present).length;
  const ministryLeft = (people || []).filter((p) => p.in_ministry && !p.present).map((p) => p.member_id);

  const q = filter.trim().toLowerCase();
  const shown = useMemo(() => (people || [])
    .filter((p) => (show === 'present' ? p.present : show === 'unmarked' ? !p.present : true))
    .filter((p) => !q || p.full_name.toLowerCase().includes(q))
    // the event's own ministry first, then A–Z like the paper sheet
    .sort((a, b) => (b.in_ministry ? 1 : 0) - (a.in_ministry ? 1 : 0) || a.full_name.localeCompare(b.full_name)),
  [people, show, q]);

  return (
    <div>
      <button onClick={onBack} className={`inline-flex items-center gap-1.5 text-sm font-semibold mb-4 ${t.sub} hover:underline`}>
        <ArrowLeft size={15} /> All events
      </button>

      {/* Event + live count */}
      <div className={`border rounded-3xl p-5 sm:p-6 mb-5 ${t.card}`}>
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1">{ministry || 'Event'}</p>
            <h1 className={`text-xl sm:text-2xl font-black ${t.text}`}>{event?.title || (people === null ? 'Loading…' : 'Event')}</h1>
            <p className={`text-sm mt-1 ${t.sub}`}>{eventDate(event?.date)}</p>
          </div>
          <div className="flex gap-3">
            {[
              { label: 'Members', value: presentCount },
              { label: 'Visitors', value: visitors.length },
              { label: 'Total', value: presentCount + visitors.length },
            ].map((s) => (
              <div key={s.label} className={`rounded-2xl px-4 py-2.5 text-center min-w-[5rem] ${t.inner}`}>
                <p className={`text-2xl font-black ${t.text}`}>{people === null ? '…' : s.value}</p>
                <p className={`text-[10px] uppercase tracking-wider font-bold ${t.muted}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        {!canMark && people !== null && !error && (
          <p className={`mt-4 text-xs flex items-center gap-1.5 ${t.muted}`}>
            <Lock size={13} /> View only — attendance is taken by the Pastor, Leaders, the Secretary and attendance helpers.
          </p>
        )}
      </div>

      {error && <p className="mb-5 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        {/* Members */}
        <section className={`xl:col-span-2 border rounded-3xl p-4 sm:p-5 ${t.card}`} aria-label="Members">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className={`font-bold flex items-center gap-2 ${t.text}`}><Users size={17} /> Members</h2>
            <div className={`flex gap-1 p-1 rounded-xl border sm:ml-auto w-fit ${t.card}`} role="tablist">
              {[['all', 'All'], ['present', 'Present'], ['unmarked', 'Not marked']].map(([key, label]) => (
                <button key={key} role="tab" aria-selected={show === key} onClick={() => setShow(key)}
                  className={`px-3 h-8 rounded-lg text-xs font-semibold ${show === key ? t.tabOn : t.tabOff}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={15} className={`absolute left-3 top-3 ${t.muted}`} />
              <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter names (optional)"
                aria-label="Filter names" className={`w-full border rounded-xl pl-9 pr-3 h-10 text-sm ${t.input}`} />
            </div>
            {canMark && ministry && ministryLeft.length > 0 && (
              <button onClick={() => mark(ministryLeft, true)}
                className={`h-10 px-3.5 rounded-xl border text-xs font-semibold whitespace-nowrap ${t.ghost}`}>
                Mark all {ministry} members ({ministryLeft.length})
              </button>
            )}
          </div>

          {people === null ? (
            <div className="grid sm:grid-cols-2 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
          ) : shown.length === 0 ? (
            <p className={`text-sm text-center py-8 ${t.muted}`}>
              {q ? 'No member matches that name.' : show === 'present' ? 'Nobody marked present yet.' : 'Nobody here.'}
            </p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-2">
              {shown.map((p) => (
                <li key={p.member_id}>
                  <label className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 transition-colors ${canMark ? 'cursor-pointer' : ''} ${p.present ? t.rowOn : t.row}`}>
                    <input type="checkbox" className="sr-only peer" checked={!!p.present} disabled={!canMark}
                      onChange={(e) => mark([p.member_id], e.target.checked)} />
                    <span aria-hidden className={`w-6 h-6 shrink-0 rounded-lg border-2 flex items-center justify-center peer-focus-visible:ring-2 ring-blue-500 ${
                      p.present ? 'bg-blue-600 border-blue-600 text-white' : dark ? 'border-slate-600' : 'border-[#c9c5b4]'}`}>
                      {busy[p.member_id] ? <Loader2 size={13} className="animate-spin" /> : p.present && <Check size={15} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold truncate ${t.text}`}>{p.full_name}</span>
                      {(p.ministries || p.status !== 'active') && (
                        <span className={`block text-[11px] truncate ${t.muted}`}>
                          {[p.ministries, p.status !== 'active' ? p.status : null].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Visitors */}
        <VisitorsBox t={t} eventId={eventId} canMark={canMark} visitors={visitors} onChange={load} />
      </div>
    </div>
  );
}

// Events whose attendance the person can take or see (approved / done,
// up to today), newest first, with their counts.
export function AttendanceEventList({ t, events, churchName, onOpen }) {
  if (events === null) {
    return <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-36 rounded-3xl" />)}</div>;
  }
  if (events.length === 0) {
    return (
      <div className={`border border-dashed rounded-3xl p-10 text-center ${t.card}`}>
        <p className={`font-bold ${t.text}`}>No events to take attendance for yet</p>
        <p className={`text-sm mt-1 ${t.sub}`}>Approved events show up here from their date onward.</p>
      </div>
    );
  }
  return (
    <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {events.map((ev) => {
        const taken = ev.members_present + ev.visitors > 0;
        // active_members = every member of the branch except archived and Busy (db/058).
        const rate = ev.active_members > 0 ? Math.min(100, Math.round((ev.members_present / ev.active_members) * 100)) : null;
        return (
          <li key={ev.id} className={`border rounded-3xl p-5 flex flex-col ${t.card}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1 truncate">{ev.ministry || 'Event'}</p>
            <p className={`font-bold leading-snug ${t.text}`}>{ev.title}</p>
            <p className={`text-xs mt-1 ${t.sub}`}>{eventDate(ev.date)}{churchName?.(ev.church_id) ? ` · ${churchName(ev.church_id)}` : ''}</p>
            <p className={`text-sm mt-3 ${taken ? t.text : t.muted}`}>
              {taken
                ? <><b>{ev.members_present}</b> members · <b>{ev.visitors}</b> visitors{rate !== null && <span className={t.muted}> · {rate}% of members</span>}</>
                : ev.no_attendance ? 'No attendance needed' : 'Attendance not taken yet'}
            </p>
            <button onClick={() => onOpen(ev.id)}
              className={`mt-4 h-10 rounded-xl text-sm font-semibold ${ev.can_mark ? 'bg-blue-600 hover:bg-blue-500 text-white' : `border ${t.ghost}`}`}>
              {ev.can_mark ? (taken ? 'Continue attendance' : 'Take attendance') : 'View attendance'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Visitors at this event: the only thing typed in, from the paper sheet.
function VisitorsBox({ t, eventId, canMark, visitors, onChange }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [invitedBy, setInvitedBy] = useState('');
  const [matches, setMatches] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => { if (open) nameRef.current?.focus(); }, [open]);

  // Returning visitor? Look them up by what's typed (name or phone digits).
  const lookup = (phone.replace(/\D/g, '').length >= 4 ? phone : name).trim();
  const searching = open && lookup.length >= 2;
  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(() => {
      supabase.rpc('find_visitors', { p_event: eventId, p_query: lookup }).then(({ data }) => setMatches(data || []));
    }, 250);
    return () => clearTimeout(timer);
  }, [lookup, searching, eventId]);
  const suggestions = searching ? matches : [];

  function reset() { setName(''); setPhone(''); setInvitedBy(''); setMatches([]); setError(''); }

  async function add(e, existing) {
    e?.preventDefault();
    setSaving(true);
    setError('');
    // Families often share one phone: a new name with an earlier visitor's
    // number may be someone else, so ask (db/058).
    let samePhone = null;
    if (!existing && phone.trim()) {
      const { data } = await supabase.rpc('visitor_by_phone', { p_event: eventId, p_phone: phone });
      const earlier = data?.[0];
      if (earlier && earlier.full_name.trim().toLowerCase() !== name.trim().toLowerCase()) {
        samePhone = await confirmDialog({
          title: 'Same phone number',
          message: `${phone.trim()} belongs to an earlier visitor, ${earlier.full_name}. Is "${name.trim()}" the same person?`,
          confirmText: `Same person (${earlier.full_name})`,
          cancelText: 'Different person',
        }) ? earlier : false;
      }
    }
    const { error: err } = await supabase.rpc('add_event_visitor', existing || samePhone
      ? { p_event: eventId, p_visitor: (existing || samePhone).visitor_id }
      : { p_event: eventId, p_name: name, p_phone: phone || null, p_invited_by: invitedBy || null, p_new_person: samePhone === false });
    setSaving(false);
    if (err) { setError(err.message); return; }
    reset();
    nameRef.current?.focus();
    onChange();
  }

  async function remove(v) {
    if (!await confirmDialog(`Remove ${v.full_name} from this event?`)) return;
    const { error: err } = await supabase.rpc('remove_event_visitor', { p_event: eventId, p_visitor: v.visitor_id });
    if (err) alertDialog(err.message); else onChange();
  }

  return (
    <section className={`border rounded-3xl p-4 sm:p-5 ${t.card}`} aria-label="Visitors">
      <div className="flex items-center gap-2 mb-1">
        <h2 className={`font-bold flex items-center gap-2 ${t.text}`}><UserRound size={17} /> Visitors</h2>
        {canMark && !open && (
          <button onClick={() => setOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">
            <UserPlus size={14} /> Add visitor
          </button>
        )}
      </div>
      <p className={`text-xs mb-4 ${t.muted}`}>Non-members from the sheet. Kept for 6 months after their last visit.</p>

      {open && (
        <form onSubmit={(e) => add(e)} className={`rounded-2xl p-3 mb-4 space-y-2.5 ${t.inner}`}>
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120}
            placeholder="Name" aria-label="Visitor name" className={`w-full border rounded-xl px-3 h-10 text-sm ${t.input}`} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} inputMode="tel"
            placeholder="Phone number" aria-label="Phone number" className={`w-full border rounded-xl px-3 h-10 text-sm ${t.input}`} />
          <input value={invitedBy} onChange={(e) => setInvitedBy(e.target.value)} maxLength={120}
            placeholder="Invited by (optional)" aria-label="Invited by" className={`w-full border rounded-xl px-3 h-10 text-sm ${t.input}`} />

          {suggestions.length > 0 && (
            <div className={`border rounded-xl p-2 ${t.card}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider px-1 mb-1 ${t.muted}`}>Visited before?</p>
              {suggestions.map((m) => (
                <button key={m.visitor_id} type="button" onClick={() => add(null, m)} disabled={saving}
                  className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg ${t.ghost} border-0`}>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold truncate ${t.text}`}>{m.full_name}</span>
                    <span className={`block text-[11px] ${t.muted}`}>
                      {[m.phone, `${m.visits} visit${m.visits === 1 ? '' : 's'}`, m.last_visit && `last ${eventDate(m.last_visit)}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-blue-500 shrink-0">Add</span>
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { reset(); setOpen(false); }}
              className={`flex-1 border rounded-xl h-10 text-sm font-semibold ${t.ghost}`}>Done</button>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl h-10 text-sm font-semibold">
              {saving && <Loader2 size={14} className="animate-spin" />} Add new visitor
            </button>
          </div>
        </form>
      )}

      {visitors.length === 0 ? (
        <p className={`text-sm text-center py-6 ${t.muted}`}>No visitors added.</p>
      ) : (
        <ul className={`divide-y ${t.divider}`}>
          {visitors.map((v) => (
            <li key={v.visitor_id} className="py-2.5 flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold truncate ${t.text}`}>{v.full_name}</span>
                <span className={`block text-[11px] ${t.muted}`}>
                  {v.phone && <><Phone size={10} className="inline -mt-0.5 mr-1" />{v.phone} · </>}
                  {v.visits <= 1 ? 'First visit' : `${ordinal(v.visits)} visit`}
                  {v.invited_by && ` · invited by ${v.invited_by}`}
                </span>
              </span>
              {v.visits <= 1 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600">NEW</span>}
              {canMark && (
                <button onClick={() => remove(v)} aria-label={`Remove ${v.full_name}`}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:text-rose-500`}><X size={15} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
