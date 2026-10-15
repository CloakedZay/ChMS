"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
  Users, Bell, Search, TrendingUp, UserCheck,
  CalendarDays, HandCoins, ChevronRight,
  ArrowUpRight, X,
  Zap, Sun, Moon, Quote
} from "lucide-react";

import { useTheme } from "@/app/context/ThemeContext";
import { useAuth } from "@/app/context/AuthContext";
import { can } from "@/app/lib/permissions";
import { verseOfDayIndex, nextLocalMidnight } from "@/app/lib/verseOfDay";
import BranchLabel from "@/app/components/BranchLabel";
import UpcomingBirthdays from "@/app/components/UpcomingBirthdays";
import CalendarWidget from "@/app/components/CalendarWidget";
import ScriptureLink from "@/app/components/ScriptureLink";
import AnnouncementsBanner from "@/app/components/AnnouncementsBanner";
import FollowUpReminder from "@/app/components/FollowUpReminder";
import AttendanceReminder from "@/app/components/AttendanceReminder";
import SpendingReminder from "@/app/components/SpendingReminder";
import { useFollowUpReminder, REMINDER_DAYS, MISSED_EVENTS } from "@/app/lib/useFollowUpReminder";
import { useEventNotices } from "@/app/lib/useEventNotices";
import { formatEventTime } from "@/app/lib/eventTime";
import { phToday } from "@/app/lib/phDate";
import { collapseSeries } from "@/app/lib/eventSeries";
import { countsInTotals } from "@/app/lib/financeTotals";
import Link from "next/link";

// ─── Theme token maps ──────────────────────────────────────────────────────────

// Light mode is deliberately dimmed a notch off pure white/slate-100 (~90%
// as bright) so it doesn't glare next to the dark theme.
function T(dark) {
  return {
    // Page bg
    pageBg:       dark ? "bg-[#111815]"        : "bg-slate-200",
    // Card bg
    cardBg:       dark ? "bg-[#1b2420]/50"     : "bg-slate-100/90",
    cardBorder:   dark ? "border-slate-800/60"  : "border-slate-300",
    // Inner card (nested)
    innerCard:    dark ? "bg-slate-900/50"      : "bg-slate-200",
    innerBorder:  dark ? "border-slate-800/40"  : "border-slate-300",
    // Text
    textPrimary:  dark ? "text-white"           : "text-slate-900",
    textSub:      dark ? "text-slate-500"       : "text-slate-600",
    textMuted:    dark ? "text-slate-600"       : "text-slate-500",
    // Input
    inputBg:      dark ? "bg-[#1b2420]"        : "bg-slate-50",
    inputBorder:  dark ? "border-slate-800"     : "border-slate-400",
    inputText:    dark ? "text-slate-200"       : "text-slate-800",
    // Header divider
    divider:      dark ? "border-slate-800"     : "border-slate-300",
    // Hover row
    hoverRow:     dark ? "hover:bg-slate-800/50" : "hover:bg-slate-200",
    // Notif panel
    notifBg:      dark ? "bg-[#1b2420]"        : "bg-slate-50",
    // Tab bar
    tabBar:       dark ? "bg-[#1b2420]/60 border-slate-800" : "bg-slate-100/90 border-slate-300",
    tabInactive:  dark ? "text-slate-500 hover:text-slate-200" : "text-slate-500 hover:text-slate-800",
    // Icon button
    iconBtn:      dark ? "bg-[#1b2420] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-300 text-slate-600 hover:text-slate-900",
    // Dashed empty state
    dashed:       dark ? "border-slate-800"     : "border-slate-400",
    emptyIcon:    dark ? "text-slate-800"       : "text-slate-400",
    // Finance deep card
    deepCard:     dark ? "bg-slate-900/60"      : "bg-slate-200",
    // Transaction border
    txBorder:     dark ? "border-slate-800/30"  : "border-slate-300",
  };
}

// Accent color for content text (numbers, icons, headings) — the -400
// shades read fine on the dark bg but are too pale for contrast on light.
// (Full literal class strings below so Tailwind's scanner can find them.)
const ACCENT = {
  blue:    { dark: "text-blue-400",    light: "text-blue-600" },
  indigo:  { dark: "text-indigo-400",  light: "text-indigo-600" },
  purple:  { dark: "text-purple-400",  light: "text-purple-600" },
  pink:    { dark: "text-pink-400",    light: "text-pink-600" },
  emerald: { dark: "text-emerald-400", light: "text-emerald-600" },
  rose:    { dark: "text-rose-400",    light: "text-rose-600" },
  yellow:  { dark: "text-yellow-400",  light: "text-yellow-600" },
};
function A(dark, color) {
  return dark ? ACCENT[color].dark : ACCENT[color].light;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  approved: "bg-emerald-500/15 text-emerald-400",
  pending:  "bg-yellow-500/15 text-yellow-400",
  planning: "bg-blue-500/15 text-blue-400",
  done:     "bg-slate-500/15 text-slate-400",
};

const ACTIVITY_ICON = {
  member:  { bg: "bg-blue-500/20 text-blue-400",       label: "M" },
  finance: { bg: "bg-emerald-500/20 text-emerald-400",  label: "₱" },
  event:   { bg: "bg-violet-500/20 text-violet-400",    label: "E" },
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const { role, user } = useAuth();
  // Follow-up reminder — staff who follow up members only, never members.
  const followUp = useFollowUpReminder(user?.id, can(role, 'followUp'));
  const eventNotices = useEventNotices(user?.id, role, can(role, 'events'));   // db/042
  const t = T(dark);

  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [showNotifs, setShowNotifs]     = useState(false);
  const notifRef                        = useRef(null);

  // ── DB states ─────────────────────────────────────────────────────────────
  const [memberCount, setMemberCount]         = useState(0);
  const [activeMembers, setActiveMembers]     = useState(0);
  // Event attendance, last 90 days (db/041): null = none taken yet.
  const [attendance, setAttendance]           = useState(null);
  const [totalFunds, setTotalFunds]           = useState(0);
  const [upcomingEvents, setUpcomingEvents]   = useState([]);
  const [upcomingCount, setUpcomingCount]     = useState(0);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [recentMembers, setRecentMembers]     = useState([]);
  const [verseOfDay, setVerseOfDay]           = useState(undefined); // undefined = loading, null = none yet

  // ── Fetch live data ───────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchLiveStats() {
      setLoading(true);
      try {
        const { count: mCount } = await supabase.from('member_directory').select('*', { count: 'exact', head: true });
        const { count: aCount } = await supabase.from('member_directory').select('*', { count: 'exact', head: true }).eq('status', 'active');
        const { data: latestMembers } = await supabase.from('member_directory').select('full_name, status, ministry').order('id', { ascending: false }).limit(3);
        const { data: allTrans } = await supabase.from('transactions').select('amount, type, fund, category, member, date, status').order('date', { ascending: false });
        const trans = allTrans?.filter(countsInTotals);
        // Upcoming = approved, from today (Philippine date) on. Planning and
        // pending events aren't happening yet. A weekly event counts once,
        // at its next date (db/049).
        const { data: allUpcoming } = await supabase.from('events').select('*')
          .eq('status', 'approved').gte('date', phToday()).order('date', { ascending: true });
        const upcoming = collapseSeries(allUpcoming || []);

        setMemberCount(mCount || 0);
        setActiveMembers(aCount || 0);

        // Members present ÷ members (not archived or Busy, db/058), over the events with attendance
        // taken in the last 90 days.
        const { data: attended } = await supabase.rpc('attendance_events', { p_church: null });
        const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        const taken = (attended || []).filter((e) => e.date >= since && e.members_present + e.visitors > 0);
        const possible = taken.reduce((a, e) => a + e.active_members, 0);
        setAttendance(taken.length && possible
          ? { rate: Math.round((taken.reduce((a, e) => a + e.members_present, 0) / possible) * 100), events: taken.length }
          : null);
        setUpcomingEvents(upcoming.slice(0, 4));
        setUpcomingCount(upcoming.length);
        setRecentMembers(latestMembers || []);

        if (trans) {
          const income  = trans.filter(t => t.type === 'income').reduce((a, t) => a + (Number(t.amount) || 0), 0);
          const expense = trans.filter(t => t.type === 'expense').reduce((a, t) => a + (Number(t.amount) || 0), 0);
          setTotalFunds(income - expense);
          setRecentTransactions(trans.slice(0, 5));
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLiveStats();
  }, []);

  // ── Verse of the day — deterministic pick that rotates at local midnight ──
  useEffect(() => {
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
  }, []);

  // ── Close notif on outside click ──────────────────────────────────────────
  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Computed ──────────────────────────────────────────────────────────────
  // The bell: follow-up reminder and event notices, each scoped by role and
  // branch. (The old shared notifications feed is gone, db/067.)
  const showReminder   = followUp.count > 0 && !followUp.snoozed;
  const bellCount      = (showReminder ? 1 : 0) + (eventNotices.pending.length ? 1 : 0) + eventNotices.reviews.length;
  const q              = search.toLowerCase().trim();

  const filteredEvents = upcomingEvents.filter(ev =>
    !q || ev.title?.toLowerCase().includes(q) || ev.ministry?.toLowerCase().includes(q) || ev.status?.toLowerCase().includes(q)
  );

  const filteredTransactions = recentTransactions.filter(tx =>
    !q || tx.category?.toLowerCase().includes(q) || tx.fund?.toLowerCase().includes(q) || tx.member?.toLowerCase().includes(q) || tx.type?.toLowerCase().includes(q)
  );

  const activityFeed = [
    ...recentTransactions.slice(0, 3).map((t) => ({
      type: "finance",
      text: `${t.type === 'income' ? 'Income' : 'Expense'}: ${t.category} — ₱${Number(t.amount).toLocaleString()}`,
      time: t.date || "—",
    })),
    ...recentMembers.map((m) => ({
      type: "member",
      text: `${m.full_name} — ${m.status || 'active'} · ${m.ministry || 'Unassigned'}`,
      time: "Member record",
    })),
    ...upcomingEvents.slice(0, 2).map((e) => ({
      type: "event",
      text: `${e.title} — ${e.status}`,
      time: e.date ? new Date(e.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : "—",
    })),
  ].filter(a => !q || a.text.toLowerCase().includes(q) || a.type.toLowerCase().includes(q)).slice(0, 6);

  const STATS = [
    { label: "Active Members",    value: loading ? "..." : memberCount.toString(),             sub: `${activeMembers} active`,     icon: Users,      color: A(dark, "blue"),   trend: "up"                        },
    { label: "Attendance Rate",   value: loading ? "..." : attendance ? `${attendance.rate}%` : "—",
      sub: attendance ? `Average of ${attendance.events} event${attendance.events === 1 ? "" : "s"}, last 90 days` : "No attendance taken yet",
      icon: UserCheck,  color: A(dark, "indigo"), trend: "neutral" },
    // Hidden for levels without finance access (Admin, Secretary) — they'd only see ₱0.
    ...(can(role, 'finance') ? [
    { label: "Total Church Funds",value: loading ? "..." : `₱${totalFunds.toLocaleString()}`,  sub: "Live balance",                icon: HandCoins,  color: A(dark, "purple"), trend: totalFunds >= 0 ? "up" : "down" },
    ] : []),
    { label: "Upcoming Events",   value: loading ? "..." : upcomingCount.toString(),   sub: "From today onward",           icon: CalendarDays,color: A(dark, "pink"),  trend: "neutral"                   },
  ];

  // ─── Shared card classname builder ────────────────────────────────────────
  const card = `${t.cardBg} border ${t.cardBorder} rounded-3xl backdrop-blur-sm`;

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} ${t.textPrimary} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8 lg:mb-10">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}><BranchLabel /></p>
          <h2 className={`text-2xl font-black ${t.textPrimary}`}>Dashboard Overview</h2>
          <p className={`${t.textSub} text-sm mt-0.5`}>
            {loading ? "Syncing with Supabase..." : "Live data from all church modules."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 sm:flex-none">
            <Search className={`absolute left-3 top-2.5 w-4 h-4 ${t.textSub}`} />
            <input
              type="text"
              placeholder="Search events, funds, members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${t.inputBg} border ${t.inputBorder} rounded-full py-2 pl-9 pr-9 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 w-full sm:w-64 transition-colors`}
            />
            {search && (
              <button onClick={() => setSearch("")} className={`absolute right-3 top-2.5 ${t.textSub} hover:text-slate-300 transition-colors`}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-full border ${t.iconBtn} transition-colors`}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Notifications bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifs((v) => !v)}
              className={`relative p-2 rounded-full border ${t.iconBtn} transition-colors`}
            >
              <Bell size={18} />
              {bellCount > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-blue-600 rounded-full ring-2 ${dark ? "ring-[#111815]" : "ring-slate-200"} text-[10px] font-black text-white flex items-center justify-center`}>
                  {bellCount > 9 ? "9+" : bellCount}
                </span>
              )}
            </button>

            {/* Notification panel */}
            {showNotifs && (
              <div className={`absolute right-0 top-12 w-80 max-w-[85vw] ${t.notifBg} border ${t.cardBorder} rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden`}>
                <div className={`flex items-center justify-between px-4 py-3 border-b ${t.divider}`}>
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span className={`text-xs font-black ${t.textPrimary} uppercase tracking-wider`}>Notifications</span>
                    {bellCount > 0 && (
                      <span className="text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded-full">{bellCount}</span>
                    )}
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {showReminder && (
                    <Link
                      href="/dashboard/follow-up"
                      onClick={() => setShowNotifs(false)}
                      className={`flex items-start gap-3 px-4 py-3 border-b ${t.divider} bg-rose-500/10 hover:bg-rose-500/15 transition-colors`}
                    >
                      <div className="mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-rose-500/20 text-rose-500">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-bold truncate ${t.textPrimary}`}>
                            {followUp.count} member{followUp.count === 1 ? '' : 's'} need{followUp.count === 1 ? 's' : ''} a follow-up
                          </p>
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-rose-500" />
                        </div>
                        <p className={`text-[10px] ${t.textSub} mt-0.5 leading-relaxed line-clamp-2`}>
                          Not active for {REMINDER_DAYS}+ days, missed {MISSED_EVENTS} events in a row, or marked inactive. Tap to review.
                        </p>
                      </div>
                    </Link>
                  )}
                  {eventNotices.pending.length > 0 && (
                    <Link
                      href="/dashboard/events?filter=pending"
                      onClick={() => setShowNotifs(false)}
                      className={`flex items-start gap-3 px-4 py-3 border-b ${t.divider} bg-orange-500/10 hover:bg-orange-500/15 transition-colors`}
                    >
                      <div className="mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-orange-500/20 text-orange-500">
                        <CalendarDays className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold truncate ${t.textPrimary}`}>
                          {eventNotices.pending.length} event{eventNotices.pending.length === 1 ? '' : 's'} waiting for your approval
                        </p>
                        <p className={`text-[10px] ${t.textSub} mt-0.5 line-clamp-2`}>
                          {eventNotices.pending.map((e) => (e.dates > 1 ? `${e.title} (${e.dates} dates)` : e.title)).join(', ')}
                        </p>
                      </div>
                    </Link>
                  )}
                  {eventNotices.reviews.map((r) => (
                    <Link
                      key={`review-${r.id}`}
                      href="/dashboard/events"
                      onClick={() => setShowNotifs(false)}
                      className={`flex items-start gap-3 px-4 py-3 border-b ${t.divider} ${r.status === 'approved' ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'bg-orange-500/10 hover:bg-orange-500/15'} transition-colors`}
                    >
                      <div className={`mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${r.status === 'approved' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-orange-500/20 text-orange-500'}`}>
                        <CalendarDays className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold truncate ${t.textPrimary}`}>
                          {`“${r.title}”${r.dates > 1 ? ` (${r.dates} dates)` : ''} was ${r.status === 'approved' ? 'approved' : 'sent back'}`}
                        </p>
                        <p className={`text-[10px] ${t.textSub} mt-0.5 line-clamp-2`}>
                          {r.status === 'approved' ? 'Your event was approved.' : r.review_note || 'It was sent back to planning.'}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {!showReminder && !eventNotices.count && (
                    <div className="py-10 text-center">
                      <Bell className={`w-6 h-6 ${t.emptyIcon} mx-auto mb-2`} />
                      <p className={`text-xs ${t.textMuted}`}>No notifications.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search banner */}
      {q && (
        <div className={`mb-6 flex items-center gap-2 text-sm ${t.textSub} ${t.cardBg} border ${t.cardBorder} rounded-xl px-4 py-2.5`}>
          <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>
            Showing results for <span className={`${t.textPrimary} font-bold`}>&ldquo;{search}&rdquo;</span>
            {" "}— {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}, {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? "s" : ""}, {activityFeed.length} activit{activityFeed.length !== 1 ? "ies" : "y"}
          </span>
          <button onClick={() => setSearch("")} className={`ml-auto ${t.textMuted} hover:text-slate-300 transition-colors`}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── OVERVIEW ── */}
      <div className="space-y-8">
        {/* Left: announcements, reminders, verse, stats and lists; right: a sidebar */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6 lg:items-start space-y-8 lg:space-y-0">
        <div className="min-w-0 space-y-8">
        {/* Announcements — always first */}
        <AnnouncementsBanner manageHref="/dashboard/announcements" />

        {/* Follow-up reminder (Pastor, Leader, Secretary) */}
        <FollowUpReminder due={followUp.due} snoozed={followUp.snoozed} onSnooze={followUp.snooze} />

        {/* Attendance not taken (Leader, Secretary; db/051) */}
        {['leader', 'secretary'].includes(role) && <AttendanceReminder />}

        {/* Spending requests waiting (Pastor, Leader, Finance) */}
        {['pastor', 'leader', 'finance'].includes(role) && <SpendingReminder />}

        <div className={`${card} p-6 flex items-start gap-4`}>
          <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Quote className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub} mb-2`}>Verse of the Day</p>
            {verseOfDay === undefined ? (
              <p className={`text-sm ${t.textMuted}`}>Loading today&apos;s verse...</p>
            ) : verseOfDay ? (
              <>
                <p className={`text-sm ${t.textPrimary} leading-relaxed italic`}>&ldquo;{verseOfDay.verse_text}&rdquo;</p>
                <p className="mt-2"><ScriptureLink prefix="— " reference={verseOfDay.reference} className={`text-xs ${t.textMuted} font-semibold`} /></p>
              </>
            ) : (
              <p className={`text-sm ${t.textMuted}`}>No verses uploaded yet. Upload the verses PDF to start showing a daily verse.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {STATS.map((s) => (
            <div key={s.label} className={`${card} p-6 hover:border-slate-600 transition-colors`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub}`}>{s.label}</p>
                <s.icon className={`w-4 h-4 ${t.textMuted}`} />
              </div>
              <p className={`text-3xl font-black mb-1 ${s.color}`}>{s.value}</p>
              <p className={`text-xs flex items-center gap-1 font-medium ${s.trend === "up" ? A(dark, "emerald") : t.textMuted}`}>
                {s.trend === "up" && <ArrowUpRight className="w-3 h-3" />}
                {s.sub}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Next Schedule */}
          <div className={`${card} p-6`}>
            <div className={`flex items-center justify-between mb-5 border-b ${t.divider} pb-3`}>
              <h3 className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub}`}>
                Next Schedule {q && <span className="ml-2 text-blue-400">· filtered</span>}
              </h3>
              <a href="/dashboard/events" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                View all <ChevronRight className="w-3 h-3" />
              </a>
            </div>
            {loading ? (
              <p className={`${t.textMuted} text-sm text-center py-8`}>Syncing...</p>
            ) : filteredEvents.length === 0 ? (
              <div className={`py-10 text-center border border-dashed ${t.dashed} rounded-2xl`}>
                <CalendarDays className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
                <p className={`text-xs ${t.textMuted}`}>{q ? `No events matching "${search}"` : "No upcoming events found."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEvents.map((ev) => (
                  <div key={ev.id} className={`flex items-start justify-between gap-3 p-3 rounded-2xl ${t.innerCard} ${t.hoverRow} transition-colors`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${t.textPrimary} truncate`}>{ev.title}</p>
                      <p className={`text-xs ${t.textMuted} mt-0.5`}>
                        {ev.date ? new Date(ev.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}
                        {ev.start_time ? `, ${formatEventTime(ev.start_time)}` : ''}
                        {ev.venue ? ` · ${ev.venue}` : ''}
                        {ev.ministry ? ` · ${ev.ministry}` : ''}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${STATUS_BADGE[ev.status] || STATUS_BADGE.planning}`}>
                      {ev.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div className={`${card} p-6`}>
            <div className={`mb-5 border-b ${t.divider} pb-3`}>
              <h3 className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub}`}>
                Activity Log {q && <span className="ml-2 text-blue-400">· filtered</span>}
              </h3>
            </div>
            {loading ? (
              <p className={`${t.textMuted} text-sm text-center py-8`}>Syncing...</p>
            ) : activityFeed.length === 0 ? (
              <div className={`py-10 text-center border border-dashed ${t.dashed} rounded-2xl`}>
                <TrendingUp className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
                <p className={`text-xs ${t.textMuted}`}>{q ? `No activity matching "${search}"` : "No recent activities logged."}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activityFeed.map((a, i) => {
                  const ic = ACTIVITY_ICON[a.type];
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <span className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${ic.bg}`}>
                        {ic.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${t.textPrimary} leading-relaxed`}>{a.text}</p>
                        <p className={`text-[10px] ${t.textMuted} mt-0.5`}>{a.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Right: upcoming birthdays and this month's events, beside everything */}
        <div className="space-y-6 lg:sticky lg:top-6">
        <UpcomingBirthdays
          compact
          cardClass={`${card} p-4`}
          titleClass={t.textPrimary}
          textClass={t.textPrimary}
          subClass={t.textMuted}
          rowClass={`${t.innerCard} border ${t.innerBorder}`}
          accentClass={A(dark, "purple")}
        />
        <CalendarWidget
          href="/dashboard/events"
          cardClass={`${card} p-4`}
          titleClass={t.textPrimary}
          subClass={t.textMuted}
          rowClass={`${t.innerCard} border ${t.innerBorder}`}
          hoverClass={t.hoverRow}
          accentClass={A(dark, "blue")}
        />
        </div>
        </div>
      </div>
    </div>
  );
}