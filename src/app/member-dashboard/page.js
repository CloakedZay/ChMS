'use client';

import Link from 'next/link';
import { useAuth } from '@/app/context/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { verseOfDayIndex, nextLocalMidnight } from '@/app/lib/verseOfDay';
import { CalendarDays, HandCoins, BookOpen, Search } from 'lucide-react';

const EVENT_BADGE = {
  approved: 'bg-emerald-500/15 text-emerald-400',
  pending:  'bg-yellow-500/15 text-yellow-400',
  planning: 'bg-blue-500/15 text-blue-400',
  done:     'bg-slate-500/15 text-slate-400',
};

export default function MemberDashboard() {
  const { user } = useAuth();

  const [dataLoading, setDataLoading]       = useState(true);
  const [memberCount, setMemberCount]       = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [totalFunds, setTotalFunds]         = useState(null);
  const [totalIncome, setTotalIncome]       = useState(null);
  const [totalExpense, setTotalExpense]     = useState(null);
  const [announcements, setAnnouncements]   = useState([]);

  // Verse of the day
  const [verseOfDay, setVerseOfDay] = useState(undefined); // undefined = loading, null = none yet

  // Member search
  const [memberSearch, setMemberSearch]   = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching]         = useState(false);

  // ── Fetch overview ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function fetchOverview() {
      setDataLoading(true);
      try {
        const { count: mCount } = await supabase
          .from('members').select('*', { count: 'exact', head: true });

        const { data: evts } = await supabase
          .from('events').select('id, title, date, ministry, status')
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true }).limit(5);

        const { data: trans, error: transErr } = await supabase
          .from('transactions').select('amount, type');
        if (transErr) console.error('Transactions fetch error:', transErr.message);

        const { data: annList } = await supabase
          .from('events').select('id, title, date, ministry, status')
          .eq('status', 'approved')
          .order('date', { ascending: false }).limit(4);

        setMemberCount(mCount || 0);
        setUpcomingEvents(evts || []);
        setAnnouncements(annList || []);

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
  }, [user]);

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

  // ── Member search — searches the full congregation ─────────────────────────
  useEffect(() => {
    if (!memberSearch.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const term = memberSearch.trim().replace(/[,()%]/g, '');
      const { data } = await supabase
        .from('members')
        .select('full_name, status, ministry, role')
        .or(`full_name.ilike.%${term}%,ministry.ilike.%${term}%,role.ilike.%${term}%`)
        .order('full_name', { ascending: true })
        .limit(20);
      setSearchResults(data || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [memberSearch]);

  const formatDate = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const formatPeso = (v) => v === null ? '—'
    : '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2 });

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto">

        {/* Search — very top */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-3 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search members by name, role, or ministry..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="w-full bg-[#1a1d2e] border border-white/10 rounded-2xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {memberSearch.trim() && (
            <div className="absolute z-30 mt-2 w-full bg-[#1a1d2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                {searching ? (
                  <p className="text-white/30 text-sm p-4">Searching...</p>
                ) : (searchResults || []).length === 0 ? (
                  <p className="text-white/30 text-sm p-4">No members match &ldquo;{memberSearch.trim()}&rdquo;.</p>
                ) : (
                  searchResults.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 hover:bg-white/[0.03] transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-black text-blue-400">
                          {m.full_name?.split(' ').map(w => w[0]).slice(0, 2).join('')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{m.full_name}</p>
                        <p className="text-xs text-white/40 truncate">{m.ministry || 'Unassigned'}</p>
                      </div>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.status === 'active' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                    </div>
                  ))
                )}
              </div>
              <Link
                href="/member-dashboard/members"
                className="block text-center text-xs font-bold text-blue-400 hover:text-blue-300 py-3 border-t border-white/5 transition-colors"
              >
                View full member directory →
              </Link>
            </div>
          )}
        </div>

        {/* Verse of the Day */}
        <div className="mb-8 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs uppercase tracking-widest font-bold text-blue-400">Verse of the Day</h2>
          </div>
          {verseOfDay === undefined ? (
            <p className="text-white/30 text-sm">Loading today&apos;s verse...</p>
          ) : verseOfDay ? (
            <>
              <p className="text-lg text-white font-semibold leading-relaxed italic">&ldquo;{verseOfDay.verse_text}&rdquo;</p>
              <p className="text-sm text-blue-300 font-bold mt-3">— {verseOfDay.reference}</p>
            </>
          ) : (
            <p className="text-white/30 text-sm">
              No verses uploaded yet. Once your church admin uploads the verses PDF, a new one will appear here every day.
            </p>
          )}
        </div>

        <div className="space-y-6">

          {/* Stats — each redirects to its module */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total Members',   value: dataLoading ? '...' : memberCount,           icon: '👥', href: '/member-dashboard/members' },
              { label: 'Upcoming Events', value: dataLoading ? '...' : upcomingEvents.length, icon: '📅', href: '/member-dashboard/events' },
              { label: 'Ministries',      value: '5',                                         icon: '✝️', href: '/member-dashboard/ministries' },
            ].map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="bg-[#1a1d2e] rounded-3xl p-5 border border-white/10 hover:border-blue-500/40 transition-colors block"
              >
                <div className="text-2xl mb-2">{s.icon}</div>
                <div className="text-2xl font-black">{s.value}</div>
                <div className="text-white/40 text-sm mt-0.5">{s.label}</div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Events */}
            <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10">
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
                            {formatDate(ev.date)}{ev.ministry ? ` · ${ev.ministry}` : ''}
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
            <Link
              href="/member-dashboard/finances"
              className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10 hover:border-blue-500/40 transition-colors block"
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
            </Link>

            {/* Announcements */}
            <div className="bg-[#1a1d2e] rounded-3xl p-6 border border-white/10 lg:col-span-2">
              <h2 className="font-black text-base mb-4">📣 Announcements</h2>
              {!dataLoading && announcements.length === 0
                ? <p className="text-white/30 text-sm">No announcements at the moment.</p>
                : <div className="space-y-3">
                    {announcements.map((a) => (
                      <div key={a.id} className="p-3 bg-white/[0.03] rounded-2xl border border-white/5">
                        <p className="text-sm font-bold text-white">{a.title}</p>
                        <p className="text-xs text-white/40 mt-1">
                          {formatDate(a.date)}{a.ministry ? ` · ${a.ministry}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
