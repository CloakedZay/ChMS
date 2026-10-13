'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Search, CalendarDays, Clock } from 'lucide-react';
import BranchLabel from '@/app/components/BranchLabel';

import Pagination, { usePaged } from '@/app/components/Pagination';
const STATUS_COLORS = {
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
  planning: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  done:     'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

// Each event takes its ministry's color (set on the Ministries page); events
// with no ministry, or one that isn't listed, get a steady color from this set.
const FALLBACK = ['#173f35', '#c5a66a', '#4f8a73', '#9c7f45', '#2b7a78', '#7a5c8f', '#b9703a', '#b03c3c'];
const NEUTRAL = '#858b87';
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

const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

function daysUntil(dateStr) {
  const a = new Date(dateStr + 'T00:00:00Z').getTime();
  const b = new Date(todayStr() + 'T00:00:00Z').getTime();
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

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      const [evts, mins] = await Promise.all([
        supabase.from('events').select('*').order('date', { ascending: true }),
        supabase.from('ministries').select('name, color_code'),
      ]);
      setEvents(evts.data || []);
      setMinistries(mins.data || []);
      setLoading(false);
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

  const today = todayStr();
  const filtered = events
    .filter((ev) => {
      const term = search.toLowerCase();
      const matchesText = ev.title?.toLowerCase().includes(term) || ev.ministry?.toLowerCase().includes(term);
      return matchesText && (ministryFilter === 'all' || ev.ministry === ministryFilter);
    })
    // upcoming first (soonest), then past (most recent first), then undated
    .sort((a, b) => {
      const rank = (e) => (!e.date ? 2 : e.date >= today ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (rank(a) === 1) return b.date.localeCompare(a.date);
      return (a.date || '').localeCompare(b.date || '');
    });

  const formatDate = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'No date set';

  // Long lists are shown 9 at a time (components/Pagination).
  const pg = usePaged(filtered, 9, `${search}|${ministryFilter}`);

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1"><BranchLabel /></p>
        <h1 className="text-2xl font-black text-white">Events &amp; Services</h1>
        <p className="text-slate-500 text-sm mt-0.5">Church activities and ministry projects, color-coded by ministry</p>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Search events or ministries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#1b2420] border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors"
        />
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <CalendarDays className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">{search || ministryFilter !== 'all' ? 'No events match your search.' : 'No events scheduled yet.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {pg.items.map((ev) => {
            const color = colorFor(ev.ministry);
            const days = ev.date ? daysUntil(ev.date) : null;
            const past = days !== null && days < 0;
            const d = ev.date ? new Date(ev.date + 'T00:00:00') : null;
            return (
              <div
                key={ev.id}
                className={`relative overflow-hidden bg-[#1b2420] border border-white/10 rounded-3xl p-6 pt-7 transition-all hover:-translate-y-0.5 hover:shadow-lg ${past ? 'opacity-70' : ''}`}
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
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[ev.status] || STATUS_COLORS.planning}`}>
                      {ev.status || 'planning'}
                    </span>
                    <h3 className="text-base font-black text-white mt-2 leading-snug">{ev.title}</h3>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border text-white/70"
                    style={{ backgroundColor: `${color}1f`, borderColor: `${color}55` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    {ev.ministry || 'No ministry assigned'}
                  </span>
                  {days !== null && (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${days >= 0 && days <= 7 ? 'text-blue-400' : 'text-white/40'}`}>
                      <Clock size={12} /> {whenLabel(days)}
                    </span>
                  )}
                </div>

                <p className="text-xs text-white/50 mt-3">{formatDate(ev.date)}</p>
                {ev.description && (
                  <p className="text-xs text-white/40 leading-relaxed mt-2 line-clamp-3">{ev.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!loading && <Pagination {...pg} label="events" />}
    </div>
  );
}
