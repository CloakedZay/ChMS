'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useTheme } from '@/app/context/ThemeContext';
import { alertDialog, confirmDialog } from '@/app/lib/dialog';

import { friendlyError } from '@/app/lib/errors';
// Staff Dashboard, Leaders and the Secretary: events of the last 14 days
// whose attendance nobody took (db/051 attendance_missing). "Not needed"
// takes one off the list for good — e.g. a meeting nobody signs in at.
// Renders nothing when the list is empty or db/051 isn't set up.

const SHOWN = 3;
const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });

export default function AttendanceReminder() {
  const { dark } = useTheme();
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = () => supabase.rpc('attendance_missing').then(({ data, error }) => setEvents(error ? [] : data || []));
  useEffect(() => {
    let gone = false;
    supabase.rpc('attendance_missing').then(({ data, error }) => { if (!gone) setEvents(error ? [] : data || []); });
    return () => { gone = true; };
  }, []);

  async function skip(ev) {
    if (!await confirmDialog({
      message: `No attendance for "${ev.title}" (${day(ev.date)})? It won't be reminded again, and it won't count when checking who missed events.`,
      confirmText: 'Not needed',
    })) return;
    setBusy(ev.id);
    const { error } = await supabase.rpc('skip_attendance', { p_event: ev.id });
    setBusy(null);
    if (error) { alertDialog(friendlyError(error)); return; }
    load();
  }

  if (!events.length) return null;

  const t = dark
    ? { card: 'bg-[#2a2516] border-[#c5a66a]/30', title: 'text-white', body: 'text-[#d6cfbb]', row: 'border-white/10', ghost: 'text-[#d6cfbb] hover:bg-white/5' }
    : { card: 'bg-[#fbf6ea] border-[#c5a66a]/50', title: 'text-[#5c4a1f]', body: 'text-[#6b5a33]', row: 'border-[#c5a66a]/25', ghost: 'text-[#6b5a33] hover:bg-[#f3ead3]' };

  return (
    <section role="status" aria-label="Attendance not taken" className={`rounded-3xl border p-5 ${t.card}`}>
      <div className="flex items-start gap-4">
        <span className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center bg-[#c5a66a]/20 text-[#9c7f45]">
          <ClipboardCheck size={20} strokeWidth={1.75} />
        </span>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm ${t.title}`}>
            Attendance not taken yet for {events.length} event{events.length === 1 ? '' : 's'}
          </p>
          <p className={`text-sm mt-0.5 ${t.body}`}>Tick who came from the paper sheet, so follow-up knows who has been missing.</p>
          <ul className="mt-3 space-y-2">
            {events.slice(0, SHOWN).map((ev) => (
              <li key={ev.id} className={`flex flex-wrap items-center gap-2 pt-2 border-t ${t.row}`}>
                <span className={`flex-1 min-w-[10rem] text-sm ${t.title}`}><b>{ev.title}</b> · {day(ev.date)}</span>
                <button onClick={() => skip(ev)} disabled={busy === ev.id}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-50 ${t.ghost}`}>Not needed</button>
                <Link href={`/dashboard/attendance?event=${ev.id}`}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-[#9c7f45] hover:bg-[#866b36] text-white text-xs font-semibold">
                  Take attendance <ArrowRight size={13} />
                </Link>
              </li>
            ))}
          </ul>
          {events.length > SHOWN && (
            <Link href="/dashboard/attendance" className={`inline-block mt-2 text-xs font-semibold underline ${t.body}`}>
              and {events.length - SHOWN} more
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
