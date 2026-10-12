'use client';

import { useEffect, useState } from 'react';
import { Cake, PartyPopper } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';

// "Upcoming birthdays" widget (db/026). Shows people whose birthday is in the
// next 30 days, soonest first — name and day only, never a birth year.
// Scoping (own church; Admin and Pastor see all) is done by the database view.
//
// The caller passes the card's classes so it matches the page it sits on.

const WINDOW_DAYS = 30;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function when(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}

export default function UpcomingBirthdays({ cardClass, titleClass, textClass, subClass, rowClass, accentClass = 'text-blue-400', compact = false }) {
  const [rows, setRows] = useState(null);   // null = loading

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('upcoming_birthdays')
        .select('id, full_name, birth_month, birth_day, days_until')
        .lte('days_until', WINDOW_DAYS)
        .order('days_until', { ascending: true })
        .order('full_name', { ascending: true })
        .limit(compact ? 5 : 8);
      if (!cancelled) setRows(error ? [] : data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={cardClass}>
      <h2 className={`font-black ${compact ? 'text-sm mb-3' : 'text-base mb-4'} flex items-center gap-2 ${titleClass}`}>
        <Cake size={compact ? 16 : 18} strokeWidth={1.75} className={accentClass} /> Upcoming Birthdays
      </h2>

      {rows === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className={`${compact ? 'py-3' : 'py-6'} text-center`}>
          <PartyPopper size={compact ? 20 : 24} strokeWidth={1.5} className={`mx-auto mb-2 ${subClass}`} />
          <p className={`${compact ? 'text-xs' : 'text-sm'} ${subClass}`}>No birthdays in the next {WINDOW_DAYS} days.</p>
        </div>
      ) : (
        <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
          {rows.map((r) => (
            <li key={r.id} className={`flex items-center justify-between gap-3 ${compact ? 'px-3 py-2 rounded-xl' : 'p-3 rounded-2xl'} ${rowClass}`}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 shrink-0 text-center leading-none">
                  <span className={`block text-[10px] uppercase font-bold tracking-wider ${accentClass}`}>{MONTHS[r.birth_month - 1]}</span>
                  <span className={`block ${compact ? 'text-base' : 'text-lg'} font-black ${textClass}`}>{r.birth_day}</span>
                </span>
                <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold truncate ${textClass}`}>{r.full_name}</p>
              </div>
              <span className={`${compact ? 'text-[11px]' : 'text-xs'} shrink-0 ${r.days_until === 0 ? `font-bold ${accentClass}` : subClass}`}>
                {r.days_until === 0 ? '🎂 ' : ''}{when(r.days_until)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
