'use client';

import Link from 'next/link';
import { BellRing, ArrowRight } from 'lucide-react';
import { useTheme } from '@/app/context/ThemeContext';
import { REMINDER_DAYS, MISSED_EVENTS } from '@/app/lib/useFollowUpReminder';

// Reminder card for the top of the staff Dashboard: who needs a follow-up.
// Takes the result of useFollowUpReminder(); renders nothing when there is
// nobody to follow up or the reminder is snoozed for today.

export default function FollowUpReminder({ due, snoozed, onSnooze }) {
  const { dark } = useTheme();
  if (!due?.length || snoozed) return null;

  const names = due.slice(0, 3).map((d) => d.full_name);
  const more = due.length - names.length;
  const list = more > 0 ? `${names.join(', ')} and ${more} more` : names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names[0];

  const t = dark
    ? { card: 'bg-[#2a1f1f] border-[#e07a7a]/30', title: 'text-white', body: 'text-[#d6c9c9]', ghost: 'text-[#d6c9c9] hover:bg-white/5' }
    : { card: 'bg-[#fbf1ef] border-[#e07a7a]/40', title: 'text-[#7a2626]', body: 'text-[#5c3b3b]', ghost: 'text-[#7a2626] hover:bg-[#f5e2de]' };

  return (
    <section role="status" aria-label="Follow-up reminder"
      className={`rounded-3xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${t.card}`}>
      <span className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center bg-[#cc5656]/15 text-[#cc5656]">
        <BellRing size={20} strokeWidth={1.75} />
      </span>
      <div className="flex-1 min-w-0">
        <p className={`font-bold text-sm ${t.title}`}>
          {due.length} member{due.length === 1 ? '' : 's'} need{due.length === 1 ? 's' : ''} a follow-up
        </p>
        <p className={`text-sm mt-0.5 ${t.body}`}>
          {list} — not active for {REMINDER_DAYS}+ days, missed their last {MISSED_EVENTS} events, or marked inactive, with no follow-up logged.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={onSnooze} className={`h-10 px-4 rounded-xl text-sm font-semibold ${t.ghost}`}>
          Remind me tomorrow
        </button>
        <Link href="/dashboard/follow-up"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#b03c3c] hover:bg-[#9c2f2f] text-white text-sm font-semibold">
          Review <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
