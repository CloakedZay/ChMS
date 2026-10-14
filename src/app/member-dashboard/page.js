'use client';

import Link from 'next/link';
import { useAuth } from '@/app/context/AuthContext';
import { can } from '@/app/lib/permissions';
import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { verseOfDayIndex, nextLocalMidnight } from '@/app/lib/verseOfDay';
import { formatEventTime } from '@/app/lib/eventTime';
import { phToday } from '@/app/lib/phDate';
import { CalendarDays, HandCoins, BookOpen } from 'lucide-react';
import UpcomingBirthdays from '@/app/components/UpcomingBirthdays';
import ScriptureLink from '@/app/components/ScriptureLink';
import AnnouncementsBanner from '@/app/components/AnnouncementsBanner';

const EVENT_BADGE = {
  approved: 'bg-emerald-500/15 text-emerald-400',
  pending:  'bg-yellow-500/15 text-yellow-400',
  planning: 'bg-blue-500/15 text-blue-400',
  done:     'bg-slate-500/15 text-slate-400',
};

export default function MemberDashboard() {
  const { user, role } = useAuth();
  // Members have no finance access (see lib/permissions.js), so the
  // church totals card stays hidden unless that changes.
  const showFinance = can(role || 'member', 'finance');

  const [dataLoading, setDataLoading]       = useState(true);
  const [myMinistryCount, setMyMinistryCount] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [upcomingCount, setUpcomingCount]   = useState(0);
  const [totalFunds, setTotalFunds]         = useState(null);
  const [totalIncome, setTotalIncome]       = useState(null);
  const [totalExpense, setTotalExpense]     = useState(null);

  // Verse of the day
  const [verseOfDay, setVerseOfDay] = useState(undefined); // undefined = loading, null = none yet

  // ── Fetch overview ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function fetchOverview() {
      setDataLoading(true);
      try {
        // Ministries this member is in (they only see their own, db/024).
        const { count: myMinCount } = await supabase
          .from('ministry_assignments').select('id', { count: 'exact', head: true });
        setMyMinistryCount(myMinCount || 0);

        // Approved events from today (Philippine date) on; drafts stay hidden.
        const { data: evts, count: evCount } = await supabase
          .from('events').select('*', { count: 'exact' })
          .eq('status', 'approved').gte('date', phToday())
          .order('date', { ascending: true }).limit(5);

        let trans = null;
        if (showFinance) {
          const { data, error: transErr } = await supabase
            .from('transactions').select('amount, type, status');
          if (transErr) console.error('Transactions fetch error:', transErr.message);
          trans = data?.filter((t) => t.status !== 'Void');
        }

        setUpcomingEvents(evts || []);
        setUpcomingCount(evCount || 0);

        if (trans) {
          const inc = trans.filter(t => t.type === 'income').reduce((a, t) => a + (Number(t.amount) || 0), 0);
          const exp = trans.filter(t => t.type === 'expense').reduce((a, t) => a + (Number(t.amount) || 0), 0);
          setTotalIncome(inc);
          setTotalExpense(exp);
          setTotalFunds(inc - exp);
        }
      } catch (err) {
        console.error('Overview fetch error:', err);
      } finally {
        setDataLoading(false);
      }
    }
    fetchOverview();
  }, [user, showFinance]);

  // ── Verse of the day — deterministic pick that rotates at local midnight ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let midnightTimer;

    async function fetchVerse() {
      const { count } = await supabase
        .from('bible_verses').select('*', { count: 'exact', head: true });

      if (!count) {
        if (!cancelled) setVerseOfDay(null);
        return;
      }

      const idx = verseOfDayIndex(count);

      const { data } = await supabase
        .from('bible_verses')
        .select('reference, verse_text')
        .order('id', { ascending: true })
        .range(idx, idx);

      if (!cancelled) setVerseOfDay(data?.[0] || null);
    }

    fetchVerse();

    function scheduleMidnightRefresh() {
      const now = new Date();
      const fireAt = new Date(nextLocalMidnight(now).getTime() + 5000); // +5s buffer past midnight
      midnightTimer = setTimeout(() => {
        fetchVerse();
        scheduleMidnightRefresh();
      }, fireAt - now);
    }
    scheduleMidnightRefresh();

    return () => {
      cancelled = true;
      clearTimeout(midnightTimer);
    };
  }, [user]);

  const formatDate = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const formatPeso = (v) => v === null ? '—'
    : '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2 });

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto">

        {/* Announcements — always first */}
        <div className="mb-6">
          <AnnouncementsBanner />
        </div>

        {/* Top: search + verse on the left, birthday box in the top-right corner */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6 lg:items-start mb-8">
        <div className="min-w-0">

        {/* Verse of the Day */}
        <div className="bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs uppercase tracking-widest font-bold text-blue-400">Verse of the Day</h2>
          </div>
          {verseOfDay === undefined ? (
            <p className="text-white/30 text-sm">Loading today&apos;s verse...</p>
          ) : verseOfDay ? (
            <>
              <p className="text-lg text-white font-semibold leading-relaxed italic">&ldquo;{verseOfDay.verse_text}&rdquo;</p>
              <p className="mt-3"><ScriptureLink prefix="— " reference={verseOfDay.reference} className="text-sm text-blue-300 font-bold" /></p>
            </>
          ) : (
            <p className="text-white/30 text-sm">
              No verses uploaded yet. Once your church admin uploads the verses PDF, a new one will appear here every day.
            </p>
          )}
        </div>

        </div>

        {/* Upcoming birthdays — compact box, top right */}
        <div className="mt-6 lg:mt-0">
          <UpcomingBirthdays
            compact
            cardClass="bg-[#1b2420] rounded-3xl p-4 border border-white/10"
            titleClass="text-white"
            textClass="text-white"
            subClass="text-white/40"
            rowClass="bg-white/[0.03] border border-white/5"
            accentClass="text-blue-400"
          />
        </div>
        </div>

        <div className="space-y-6">

          {/* Stats — each redirects to its module */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              // Members don't get a member directory or head count; their next event instead.
              { label: upcomingEvents[0] ? `Next: ${upcomingEvents[0].title}` : 'Next event',
                value: dataLoading ? '...' : upcomingEvents[0] ? formatDate(upcomingEvents[0].date) : 'None yet',
                icon: '🗓️', href: '/member-dashboard/events' },
              { label: 'Upcoming Events', value: dataLoading ? '...' : upcomingCount, icon: '📅', href: '/member-dashboard/events' },
              { label: 'My Ministries',   value: dataLoading ? '...' : myMinistryCount ?? 0,  icon: '✝️', href: '/member-dashboard/ministries' },
            ].map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="bg-[#1b2420] rounded-3xl p-5 border border-white/10 hover:border-blue-500/40 transition-colors block"
              >
                <div className="text-2xl mb-2">{s.icon}</div>
                <div className="text-2xl font-black">{s.value}</div>
                <div className="text-white/40 text-sm mt-0.5">{s.label}</div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Events — full width when the Finance card is hidden */}
            <div className={`bg-[#1b2420] rounded-3xl p-6 border border-white/10 ${showFinance ? '' : 'lg:col-span-2'}`}>
              <h2 className="font-black text-base mb-4 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-400" /> Upcoming Events
              </h2>
              {!dataLoading && upcomingEvents.length === 0
                ? <p className="text-white/30 text-sm">No upcoming events scheduled.</p>
                : <div className="space-y-3">
                    {upcomingEvents.map((ev) => (
                      <div key={ev.id} className="flex items-start justify-between gap-3 p-3 bg-white/[0.03] rounded-2xl border border-white/5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{ev.title}</p>
                          <p className="text-xs text-white/40 mt-0.5">
                            {formatDate(ev.date)}{ev.start_time ? `, ${formatEventTime(ev.start_time)}` : ''}{ev.venue ? ` · ${ev.venue}` : ''}{ev.ministry ? ` · ${ev.ministry}` : ''}
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${EVENT_BADGE[ev.status] || EVENT_BADGE.planning}`}>
                          {ev.status || 'planning'}
                        </span>
                      </div>
                    ))}
                  </div>
              }
            </div>

            {/* Finance */}
            {showFinance && <Link
              href="/member-dashboard/finances"
              className="bg-[#1b2420] rounded-3xl p-6 border border-white/10 hover:border-blue-500/40 transition-colors block"
            >
              <h2 className="font-black text-base mb-4 flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-purple-400" /> Finances
              </h2>
              <div className="space-y-3">
                {[
                  { label: 'Church Balance', value: formatPeso(totalFunds),   color: 'text-blue-400'    },
                  { label: 'Total Income',   value: formatPeso(totalIncome),  color: 'text-emerald-400' },
                  { label: 'Total Expenses', value: formatPeso(totalExpense), color: 'text-rose-400'    },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-2xl border border-white/5">
                    <p className="text-xs text-white/40">{item.label}</p>
                    <p className={`text-base font-black font-mono ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </Link>}

          </div>
        </div>
      </div>
    </div>
  );
}
