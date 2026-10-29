'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Search, CalendarDays, Clock, MapPin, Repeat, LayoutGrid, X, Video, ImageIcon } from 'lucide-react';
import { formatEventTime } from '@/app/lib/eventTime';
import { phToday } from '@/app/lib/phDate';
import { groupSeries, seriesLabel } from '@/app/lib/eventSeries';
import BranchLabel from '@/app/components/BranchLabel';
import EventCalendar, { eventStatusLabel } from '@/app/components/EventCalendar';
import EventPhotos from '@/app/components/EventPhotos';

import Pagination, { usePaged } from '@/app/components/Pagination';
import { useDialog } from '@/app/lib/useDialog';
const STATUS_COLORS = {
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  done:     'bg-slate-500/10 text-slate-400 border-slate-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

// An event with a ministry takes its color (set on the Ministries page); a
// ministry that isn't listed gets a steady color from this set.
const FALLBACK = ['#173f35', '#c5a66a', '#4f8a73', '#9c7f45', '#2b7a78', '#7a5c8f', '#b9703a', '#b03c3c'];
const NEUTRAL = '#858b87';
// Events without a ministry (the usual case since db/050) take their
// status's color instead, so the page isn't all grey.
const STATUS_TINT = { approved: '#2f6b57', done: NEUTRAL, cancelled: '#b03c3c' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function hashColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

// White or dark text, whichever reads better on a solid color.
function textOn(hex) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#173f35' : '#ffffff';
}


function daysUntil(dateStr) {
  const a = new Date(dateStr + 'T00:00:00Z').getTime();
  const b = new Date(phToday() + 'T00:00:00Z').getTime();
  return Math.round((a - b) / 86400000);
}

function whenLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  if (days === -1) return 'Yesterday';
  return `${-days} days ago`;
}

export default function MemberEventsPage() {
  const [events, setEvents]       = useState([]);
  const [ministries, setMinistries] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [ministryFilter, setMinistryFilter] = useState('all');
  const [archive, setArchive]     = useState(false);     // cancelled events only
  const [view, setView]           = useState('cards');   // or 'calendar'; remembered on this browser
  const [openId, setOpenId]       = useState(null);      // event opened from the calendar

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      const [evts, mins] = await Promise.all([
        // Upcoming, Done and Cancelled (db/044; old drafts never show).
        // Cancelled ones stay listed, marked, so nobody turns up for nothing (db/051).
        supabase.from('events').select('*').in('status', ['approved', 'done', 'cancelled']).order('date', { ascending: true }),
        supabase.from('ministries').select('name, color_code'),
      ]);
      setEvents(evts.data || []);
      setMinistries(mins.data || []);
      setLoading(false);
      try { if (localStorage.getItem('faithsync-events-view') === 'calendar') setView('calendar'); } catch { /* storage blocked */ }
    }
    fetchEvents();
  }, []);

  const colorFor = useMemo(() => {
    const byName = new Map(ministries.filter((m) => m.color_code).map((m) => [m.name.toLowerCase(), m.color_code]));
    return (ministry) => {
      if (!ministry) return NEUTRAL;
      return byName.get(ministry.toLowerCase()) || hashColor(ministry);
    };
  }, [ministries]);

  // Ministries that actually have events, for the filter chips.
  const chips = useMemo(() => {
    const seen = new Set();
    events.forEach((e) => { if (e.ministry) seen.add(e.ministry); });
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [events]);

  const today = phToday();
  const matching = events.filter((ev) => {
    const term = search.toLowerCase();
    const matchesText = ev.title?.toLowerCase().includes(term) || ev.ministry?.toLowerCase().includes(term);
    // Cancelled events sit in the Archive, out of the normal list.
    return matchesText && (ministryFilter === 'all' || ev.ministry === ministryFilter) && (ev.status === 'cancelled') === archive;
  });
  // A weekly event (db/049) is one card: its next date. The calendar shows every date.
  const filtered = groupSeries(matching, today)
    // upcoming first (soonest), then past (most recent first), then undated
    .sort((a, b) => {
      const rank = (e) => (!e.date ? 2 : e.date >= today ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (rank(a) === 1) return b.date.localeCompare(a.date);
      return (a.date || '').localeCompare(b.date || '');
    });

  function switchView(v) {
    setView(v);
    try { localStorage.setItem('faithsync-events-view', v); } catch { /* storage blocked — fine */ }
  }
  const opened = (() => {
    const ev = events.find((e) => e.id === openId);
    if (!ev?.series_id) return ev || null;
    const dates = events.filter((e) => e.series_id === ev.series_id).map((e) => e.date).sort();
    return { ...ev, series: { count: dates.length, first: dates[0], last: dates[dates.length - 1] } };
  })();

  const formatDate = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'No date set';

  // Long lists are shown 9 at a time (components/Pagination).
  const pg = usePaged(filtered, 9, `${search}|${ministryFilter}`);

  // Pop-ups: focus, Tab, Esc and a name for screen readers (lib/useDialog).
  const openedDialogRef = useDialog(!!opened, () => setOpenId(null));

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1"><BranchLabel /></p>
        <h1 className="text-2xl font-black text-white">Events &amp; Services</h1>
        <p className="text-slate-500 text-sm mt-0.5">Church activities and services: upcoming in green, done in grey, cancelled in red</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Search events or ministries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#1b2420] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>
        <button type="button" onClick={() => setArchive((a) => !a)} aria-pressed={archive}
          className={`self-start sm:ml-auto h-9 px-3 rounded-xl border text-xs font-bold ${archive ? 'bg-blue-600 border-blue-600 text-white' : 'border-white/10 bg-[#1b2420] text-white/60 hover:text-white'}`}>
          {archive ? 'Back to events' : `Archive (${events.filter((e) => e.status === 'cancelled').length})`}
        </button>
        <div className="flex gap-1 p-1 rounded-xl border border-white/10 bg-[#1b2420] self-start" role="tablist" aria-label="View">
          {[['cards', 'Cards', LayoutGrid], ['calendar', 'Calendar', CalendarDays]].map(([key, label, Icon]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => switchView(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${view === key ? 'bg-blue-600 text-white' : 'text-white/50 hover:text-white'}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Ministry filter chips — each in its ministry's color */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setMinistryFilter('all')}
            aria-pressed={ministryFilter === 'all'}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              ministryFilter === 'all'
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
            }`}
          >
            All events
          </button>
          {chips.map((name) => {
            const color = colorFor(name);
            const on = ministryFilter === name;
            return (
              <button
                key={name}
                onClick={() => setMinistryFilter(on ? 'all' : name)}
                aria-pressed={on}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors text-white/70 hover:text-white"
                style={{
                  backgroundColor: on ? `${color}33` : `${color}12`,
                  borderColor: on ? color : `${color}40`,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {name}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-48 w-full rounded-3xl" />)}
        </div>
      ) : view === 'calendar' ? (
        <EventCalendar events={matching} onSelect={(e) => setOpenId(e.id)} dark />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <CalendarDays className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">{search || ministryFilter !== 'all' ? 'No events match your search.' : 'No events scheduled yet.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {pg.items.map((ev) => {
            const color = ev.ministry ? colorFor(ev.ministry) : (STATUS_TINT[ev.status] || STATUS_TINT.approved);
            const days = ev.date ? daysUntil(ev.date) : null;
            const past = days !== null && days < 0;
            const d = ev.date ? new Date(ev.date + 'T00:00:00') : null;
            return (
              <div
                key={ev.id}
                className={`relative overflow-hidden bg-[#1b2420] border border-white/10 rounded-3xl p-6 pt-7 transition-all hover:-translate-y-0.5 hover:shadow-lg ${past || ev.status === 'cancelled' ? 'opacity-85' : ''}`}
                style={{ backgroundImage: `linear-gradient(135deg, ${color}14, transparent 55%)` }}
              >
                <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: color }} aria-hidden="true" />

                <div className="flex items-start gap-4">
                  {/* Date block in the ministry's color */}
                  <div
                    className="w-14 shrink-0 rounded-2xl py-2 text-center leading-none shadow-sm"
                    style={{ backgroundColor: ev.date ? color : `${color}40`, color: ev.date ? textOn(color) : undefined }}
                  >
                    {d ? (
                      <>
                        <span className="block text-[10px] font-bold uppercase tracking-wider opacity-90">{MONTHS[d.getMonth()]}</span>
                        <span className="block text-2xl font-black mt-1">{d.getDate()}</span>
                      </>
                    ) : (
                      <span className="block text-[10px] font-bold uppercase py-3">TBA</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[ev.status] || STATUS_COLORS.approved}`}>
                      {eventStatusLabel(ev.status)}
                    </span>
                    <h3 className={`text-base font-black text-white mt-2 leading-snug ${ev.status === 'cancelled' ? 'line-through' : ''}`}>{ev.title}</h3>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {ev.ministry && (
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border text-white/70"
                      style={{ backgroundColor: `${color}1f`, borderColor: `${color}55` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                      {ev.ministry}
                    </span>
                  )}
                  {days !== null && (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${days >= 0 && days <= 7 ? 'text-blue-400' : 'text-white/40'}`}>
                      <Clock size={12} /> {whenLabel(days)}
                    </span>
                  )}
                </div>

                <p className="text-xs text-white/50 mt-3">
                  {formatDate(ev.date)}{ev.start_time && ` · ${formatEventTime(ev.start_time)}`}
                </p>
                {ev.venue && (
                  <p className="flex items-start gap-1.5 text-xs text-white/50 mt-1">
                    <MapPin size={12} className="shrink-0 mt-px" /> {ev.venue}
                  </p>
                )}
                {ev.meeting_link && ev.status !== 'cancelled' && (
                  <a href={ev.meeting_link} target="_blank" rel="noopener noreferrer"
                    className="relative z-10 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:underline mt-1">
                    <Video size={12} className="shrink-0" /> Join online
                  </a>
                )}
                {past && ev.status !== 'cancelled' && (
                  <button type="button" onClick={() => setOpenId(ev.id)}
                    className="relative z-10 flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:underline mt-1">
                    <ImageIcon size={12} className="shrink-0" /> Photos
                  </button>
                )}
                {ev.status === 'cancelled' && (
                  <p className="text-xs mt-2 rounded-xl px-3 py-2 bg-red-500/10 border border-red-500/20 text-white/70">
                    <span className="font-bold text-red-400">Cancelled{ev.cancel_note ? ':' : ''}</span> {ev.cancel_note}
                  </p>
                )}
                {ev.series && (
                  <p className="flex items-start gap-1.5 text-xs text-white/50 mt-1">
                    <Repeat size={12} className="shrink-0 mt-px" /> {seriesLabel(ev)}
                  </p>
                )}
                {ev.description && (
                  <p className="text-xs text-white/40 leading-relaxed mt-2 line-clamp-3">{ev.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!loading && view === 'cards' && <Pagination {...pg} label="events" />}

      {/* An event opened from the calendar */}
      {opened && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}>
          <div ref={openedDialogRef} role="dialog" aria-modal="true" aria-label={opened.title}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#1b2420] border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[opened.status] || STATUS_COLORS.approved}`}>
                {opened.status}
              </span>
              <button onClick={() => setOpenId(null)} aria-label="Close" className="text-white/50 hover:text-white"><X size={18} /></button>
            </div>
            <h2 className={`text-lg font-black text-white mt-3 ${opened.status === 'cancelled' ? 'line-through' : ''}`}>{opened.title}</h2>
            {opened.ministry && <p className="text-[11px] font-semibold text-white/50 mt-0.5">{opened.ministry}</p>}
            <p className="text-sm text-white/70 mt-3 flex items-center gap-2">
              <CalendarDays size={14} className="shrink-0" /> {formatDate(opened.date)}{opened.start_time && ` · ${formatEventTime(opened.start_time)}`}
            </p>
            {opened.venue && <p className="text-sm text-white/70 mt-1.5 flex items-center gap-2"><MapPin size={14} className="shrink-0" /> {opened.venue}</p>}
            {opened.meeting_link && opened.status !== 'cancelled' && (
              <a href={opened.meeting_link} target="_blank" rel="noopener noreferrer"
                className="text-sm text-blue-400 font-semibold mt-1.5 flex items-center gap-2 hover:underline"><Video size={14} className="shrink-0" /> Join online</a>
            )}
            {opened.series && <p className="text-sm text-white/70 mt-1.5 flex items-center gap-2"><Repeat size={14} className="shrink-0" /> {seriesLabel(opened)}</p>}
            {opened.status === 'cancelled' && (
              <p className="text-xs mt-3 rounded-xl px-3 py-2 bg-red-500/10 border border-red-500/20 text-white/70">
                <span className="font-bold text-red-400">Cancelled{opened.cancel_note ? ':' : ''}</span> {opened.cancel_note}
              </p>
            )}
            {opened.description && <p className="text-sm text-white/60 leading-relaxed mt-3 whitespace-pre-wrap">{opened.description}</p>}
            {opened.status !== 'cancelled' && opened.date && opened.date <= phToday() && <EventPhotos eventId={opened.id} canAdd={false} />}
          </div>
        </div>
      )}
    </div>
  );
}
