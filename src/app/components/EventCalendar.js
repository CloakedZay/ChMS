'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { phToday } from '@/app/lib/phDate';
import { formatEventTime } from '@/app/lib/eventTime';

// Month view of events, like a wall calendar: each day lists its events
// (time and title), colored by status. On phones, where a 7-column grid is
// too small, the same month is shown as a list of days. Clicking an event
// calls onSelect(event); the page decides what opens.
//
//   events   every date (not grouped by series), already filtered
//   dark     the page's theme (the member pages are always dark)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

// Fixed hex colors on purpose: the theme remaps the named Tailwind colors
// (blue → green…), which made two statuses look alike (same reason as
// lib/roleColors.js).
const CHIP = {
  approved:  { dark: 'bg-[#2f6b58]/40 text-[#a8dcc0]', light: 'bg-[#2f6b58]/15 text-[#1f4d3f]', dot: 'bg-[#2f6b58]' },
  done:      { dark: 'bg-white/[0.07] text-[#b5bab7]', light: 'bg-[#858b87]/15 text-[#4c534f]', dot: 'bg-[#858b87]' },
  cancelled: { dark: 'bg-[#b03c3c]/15 text-[#f0a0a0]/80 line-through', light: 'bg-[#b03c3c]/10 text-[#9c2f2f]/80 line-through', dot: 'bg-[#b03c3c]' },
};
// What each status is called on screen (db/085). 'approved' stays the
// database value; people see "Upcoming" until the date passes and it turns
// 'done' by itself (complete_past_events, db/042).
export const EVENT_STATUS_LABEL = { approved: 'Upcoming', done: 'Done', cancelled: 'Cancelled' };
export const eventStatusLabel = (status) => EVENT_STATUS_LABEL[status] || EVENT_STATUS_LABEL.approved;
export const STATUS_LEGEND = [['approved', 'Upcoming'], ['done', 'Done'], ['cancelled', 'Cancelled']];

export default function EventCalendar({ events, onSelect, dark, legend = STATUS_LEGEND }) {
  const today = phToday();
  const [month, setMonth] = useState(today.slice(0, 7));   // "YYYY-MM"
  const y = +month.slice(0, 4), m = +month.slice(5, 7) - 1;
  const shiftMonth = (n) => {
    const d = new Date(Date.UTC(y, m + n, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  const s = dark
    ? { card: 'bg-[#1b2420] border-white/10', head: 'text-white', muted: 'text-slate-500', line: 'border-white/5',
        hover: 'hover:bg-white/10', btn: 'border-white/10 text-slate-300 hover:bg-white/5', dim: 'bg-black/10' }
    : { card: 'bg-white border-[#e5e3d8]', head: 'text-[#173f35]', muted: 'text-[#858b87]', line: 'border-[#efede4]',
        hover: 'hover:bg-[#f0efe8]', btn: 'border-[#d9d6c8] text-[#4c534f] hover:bg-[#f8f7f2]', dim: 'bg-[#f8f7f2]' };
  const chip = (status) => (CHIP[status] || CHIP.approved)[dark ? 'dark' : 'light'];

  // This month's events by date, earliest time first.
  const byDay = useMemo(() => {
    const map = new Map();
    events.filter((e) => e.date?.startsWith(month)).forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    });
    map.forEach((list) => list.sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99') || a.title.localeCompare(b.title)));
    return map;
  }, [events, month]);

  const lead = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const listDays = [...byDay.keys()].sort();

  const label = (e) => `${e.start_time ? `${formatEventTime(e.start_time)} ` : ''}${e.title}`;

  return (
    <div className={`border rounded-3xl p-4 sm:p-5 ${s.card}`}>
      {/* Month, arrows, today */}
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
          className={`w-9 h-9 rounded-xl border flex items-center justify-center ${s.btn}`}><ChevronLeft size={16} /></button>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
          className={`w-9 h-9 rounded-xl border flex items-center justify-center ${s.btn}`}><ChevronRight size={16} /></button>
        <h2 className={`text-lg font-black ml-1 ${s.head}`} aria-live="polite">{MONTHS[m]} {y}</h2>
        {month !== today.slice(0, 7) && (
          <button type="button" onClick={() => setMonth(today.slice(0, 7))}
            className={`ml-auto h-9 px-3 rounded-xl border text-xs font-semibold ${s.btn}`}>Today</button>
        )}
      </div>

      {/* Wall calendar — tablets and up */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 mb-1">
          {WEEK.map((w) => <span key={w} className={`text-[10px] font-bold uppercase tracking-widest text-center ${s.muted}`}>{w}</span>)}
        </div>
        <div className={`grid grid-cols-7 border-t border-l ${s.line}`}>
          {cells.map((d, i) => {
            const list = d ? byDay.get(d) || [] : [];
            return (
              <div key={d || `x${i}`} className={`min-h-[6.5rem] border-r border-b p-1.5 ${s.line} ${d ? '' : s.dim}`}>
                {d && (
                  <>
                    <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold ${
                      d === today ? 'bg-[#c5a66a] text-[#173f35]' : s.muted}`}>{+d.slice(8)}</span>
                    <div className="mt-1 space-y-1 max-h-24 overflow-y-auto">
                      {list.map((e) => (
                        <button key={e.id} type="button" onClick={() => onSelect?.(e)} title={label(e)}
                          className={`w-full text-left truncate rounded-md px-1.5 py-1 text-[11px] font-semibold hover:brightness-110 ${chip(e.status)}`}>
                          {label(e)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phones: the month as a list of days */}
      <div className="sm:hidden">
        {listDays.length === 0 ? (
          <div className="py-10 text-center">
            <CalendarDays className={`w-7 h-7 mx-auto mb-2 ${s.muted}`} />
            <p className={`text-sm ${s.muted}`}>No events in {MONTHS[m]}.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {listDays.map((d) => (
              <li key={d}>
                <p className={`text-xs font-bold mb-1.5 ${d === today ? 'text-[#c5a66a]' : s.muted}`}>
                  {new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {d === today && ' · Today'}
                </p>
                <div className="space-y-1.5">
                  {byDay.get(d).map((e) => (
                    <button key={e.id} type="button" onClick={() => onSelect?.(e)}
                      className={`w-full text-left rounded-xl px-3 py-2 text-sm font-semibold ${chip(e.status)}`}>
                      {label(e)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* What the colors mean */}
      {legend?.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4">
          {legend.map(([key, text]) => (
            <span key={key} className={`inline-flex items-center gap-1.5 text-[11px] ${s.muted}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${(CHIP[key] || CHIP.planning).dot}`} /> {text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
