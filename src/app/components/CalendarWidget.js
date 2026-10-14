'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { phToday } from '@/app/lib/phDate';
import { formatEventTime } from '@/app/lib/eventTime';

// Small month calendar for the dashboards, beside "Upcoming Birthdays": a
// dot under each day that has events; tapping a day lists them below
// (today at first). Only events that are on (approved / done) and
// cancelled ones, crossed out — drafts stay on the Events page.
// The caller passes the card's classes so it matches the page it sits on.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n) => String(n).padStart(2, '0');

export default function CalendarWidget({ href, cardClass, titleClass, subClass, rowClass, hoverClass, accentClass = 'text-blue-400' }) {
  const today = phToday();
  const [month, setMonth] = useState(today.slice(0, 7));   // "YYYY-MM"
  const [picked, setPicked] = useState(today);
  const [events, setEvents] = useState(null);               // null = loading
  const y = +month.slice(0, 4), m = +month.slice(5, 7) - 1;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  useEffect(() => {
    let gone = false;
    supabase.from('events').select('id, title, date, start_time, status')
      .in('status', ['approved', 'done', 'cancelled'])
      .gte('date', `${month}-01`).lte('date', `${month}-${pad(days)}`)
      .order('date').order('start_time', { nullsFirst: false })
      .then(({ data, error }) => { if (!gone) setEvents(error ? [] : data || []); });
    return () => { gone = true; };
  }, [month, days]);

  function shiftMonth(n) {
    const d = new Date(Date.UTC(y, m + n, 1));
    const next = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    setEvents(null);
    setMonth(next);
    setPicked(next === today.slice(0, 7) ? today : `${next}-01`);
  }

  const on = new Set((events || []).filter((e) => e.status !== 'cancelled').map((e) => e.date));
  const any = new Set((events || []).map((e) => e.date));
  const lead = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  const dayList = (events || []).filter((e) => e.date === picked);
  const pickedLabel = picked === today ? 'Today'
    : new Date(`${picked}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2 mb-3">
        <h2 className={`font-black text-sm flex items-center gap-2 flex-1 min-w-0 ${titleClass}`}>
          <CalendarDays size={16} strokeWidth={1.75} className={accentClass} />
          <span className="truncate">{MONTHS[m]} {y}</span>
        </h2>
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${subClass} ${hoverClass}`}><ChevronLeft size={15} /></button>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${subClass} ${hoverClass}`}><ChevronRight size={15} /></button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEK.map((w, i) => <span key={i} className={`text-[10px] font-bold ${subClass}`}>{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const isPicked = d === picked;
          return (
            <button key={d} type="button" onClick={() => setPicked(d)} aria-pressed={isPicked}
              aria-label={`${d}${any.has(d) ? ', has events' : ''}`}
              className={`relative mx-auto w-8 h-8 rounded-full text-xs tabular-nums transition-colors ${
                isPicked ? 'bg-[#2f6b58] text-white font-bold'
                : d === today ? `ring-1 ring-inset ring-[#c5a66a] font-bold ${titleClass}`
                : `${titleClass} ${hoverClass}`}`}>
              {+d.slice(8)}
              {any.has(d) && (
                <span className={`absolute left-1/2 -translate-x-1/2 bottom-1 w-1 h-1 rounded-full ${
                  isPicked ? 'bg-white' : on.has(d) ? 'bg-[#c5a66a]' : 'bg-[#b03c3c]'}`} />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${subClass}`}>{pickedLabel}</p>
        {events === null ? (
          <div className="skeleton h-9 w-full" />
        ) : dayList.length === 0 ? (
          <p className={`text-xs ${subClass}`}>No events.</p>
        ) : (
          <ul className="space-y-1.5">
            {dayList.map((e) => (
              <li key={e.id}>
                <Link href={href} className={`block px-3 py-2 rounded-xl text-xs ${rowClass} ${hoverClass}`}>
                  <span className={`font-semibold ${titleClass} ${e.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>{e.title}</span>
                  <span className={`block mt-0.5 ${subClass}`}>
                    {e.status === 'cancelled' ? 'Cancelled' : e.start_time ? formatEventTime(e.start_time) : 'All day'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href={href} className={`inline-flex items-center gap-1 mt-3 text-xs font-semibold ${accentClass} hover:underline`}>
          All events <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
