"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
  Users, Bell, Search, TrendingUp, UserCheck,
  CalendarDays, HandCoins, ChevronRight,
  ArrowUpRight, BookOpen, TrendingDown, X,
  CheckCheck, Zap, CheckCircle, XCircle, Clock,
  ChevronDown, MessageSquare, Sun, Moon
} from "lucide-react";

import { useTheme } from "@/app/context/ThemeContext";

// ─── Theme token maps ──────────────────────────────────────────────────────────

// Light mode is deliberately dimmed a notch off pure white/slate-100 (~90%
// as bright) so it doesn't glare next to the dark theme.
function T(dark) {
  return {
    // Page bg
    pageBg:       dark ? "bg-[#0f111a]"        : "bg-slate-200",
    // Card bg
    cardBg:       dark ? "bg-[#1a1d2e]/50"     : "bg-slate-100/90",
    cardBorder:   dark ? "border-slate-800/60"  : "border-slate-300",
    // Inner card (nested)
    innerCard:    dark ? "bg-slate-900/50"      : "bg-slate-200",
    innerBorder:  dark ? "border-slate-800/40"  : "border-slate-300",
    // Text
    textPrimary:  dark ? "text-white"           : "text-slate-900",
    textSub:      dark ? "text-slate-500"       : "text-slate-600",
    textMuted:    dark ? "text-slate-600"       : "text-slate-500",
    // Input
    inputBg:      dark ? "bg-[#1a1d2e]"        : "bg-slate-50",
    inputBorder:  dark ? "border-slate-800"     : "border-slate-400",
    inputText:    dark ? "text-slate-200"       : "text-slate-800",
    // Header divider
    divider:      dark ? "border-slate-800"     : "border-slate-300",
    // Hover row
    hoverRow:     dark ? "hover:bg-slate-800/50" : "hover:bg-slate-200",
    // Notif panel
    notifBg:      dark ? "bg-[#1a1d2e]"        : "bg-slate-50",
    // Tab bar
    tabBar:       dark ? "bg-[#1a1d2e]/60 border-slate-800" : "bg-slate-100/90 border-slate-300",
    tabInactive:  dark ? "text-slate-500 hover:text-slate-200" : "text-slate-500 hover:text-slate-800",
    // Icon button
    iconBtn:      dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-300 text-slate-600 hover:text-slate-900",
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

const MINISTRIES = [
  { name: "Program & Music Ministry",  head: "Mr. Israel Dadap",    members: 12, initials: "ID" },
  { name: "Mission & Evangelism",      head: "Mr. Neator Jose",     members: 9,  initials: "NJ" },
  { name: "Training & Life Ministry",  head: "Ms. Lolita Jose",     members: 8,  initials: "LJ" },
  { name: "Building & Equipment",      head: "Mr. Ariel Dela Peña", members: 6,  initials: "AD" },
  { name: "Finance Ministry",          head: "Mr. David Lopez",     members: 5,  initials: "DL" },
];

const FUNDS = ["Monthly Budget", "General Fund", "Project Fund", "Lot Fund"];
const FUND_DOTS = {
  "Monthly Budget": "bg-yellow-500",
  "General Fund":   "bg-blue-500",
  "Project Fund":   "bg-purple-500",
  "Lot Fund":       "bg-pink-500",
};

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

const NOTIF_STYLE = {
  member:  { bg: "bg-blue-500/10",    dot: "bg-blue-500",    icon: Users },
  event:   { bg: "bg-violet-500/10",  dot: "bg-violet-500",  icon: CalendarDays },
  finance: { bg: "bg-emerald-500/10", dot: "bg-emerald-500", icon: HandCoins },
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);

  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState("overview");
  const [search, setSearch]             = useState("");
  const [showNotifs, setShowNotifs]     = useState(false);
  const notifRef                        = useRef(null);

  // ── DB states ─────────────────────────────────────────────────────────────
  const [memberCount, setMemberCount]         = useState(0);
  const [activeMembers, setActiveMembers]     = useState(0);
  const [totalFunds, setTotalFunds]           = useState(0);
  const [totalIncome, setTotalIncome]         = useState(0);
  const [totalExpense, setTotalExpense]        = useState(0);
  const [fundTotals, setFundTotals]           = useState({});
  const [upcomingEvents, setUpcomingEvents]   = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [recentMembers, setRecentMembers]     = useState([]);
  const [notifications, setNotifications]     = useState([]);

  // ── Training states ───────────────────────────────────────────────────────
  const [trainingModules, setTrainingModules]   = useState([]);
  const [submissions, setSubmissions]           = useState([]);
  const [memberProfiles, setMemberProfiles]     = useState({});
  const [expandedMember, setExpandedMember]     = useState(null);
  const [expandedModReview, setExpandedModReview] = useState(null);
  const [reviewNotes, setReviewNotes]           = useState({});
  const [reviewing, setReviewing]               = useState({});

  // ── Fetch live data ───────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchLiveStats() {
      setLoading(true);
      try {
        const { count: mCount } = await supabase.from('members').select('*', { count: 'exact', head: true });
        const { count: aCount } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'active');
        const { data: latestMembers } = await supabase.from('members').select('full_name, status, ministry').order('id', { ascending: false }).limit(3);
        const { data: trans } = await supabase.from('transactions').select('amount, type, fund, category, member, date').order('date', { ascending: false });
        const { data: evts } = await supabase.from('events').select('*').gte('date', new Date().toISOString().split('T')[0]).order('date', { ascending: true }).limit(4);

        setMemberCount(mCount || 0);
        setActiveMembers(aCount || 0);
        setUpcomingEvents(evts || []);
        setRecentMembers(latestMembers || []);

        if (trans) {
          const income  = trans.filter(t => t.type === 'income').reduce((a, t) => a + (Number(t.amount) || 0), 0);
          const expense = trans.filter(t => t.type === 'expense').reduce((a, t) => a + (Number(t.amount) || 0), 0);
          setTotalIncome(income);
          setTotalExpense(expense);
          setTotalFunds(income - expense);
          setRecentTransactions(trans.slice(0, 5));
          const fTotals = FUNDS.reduce((acc, fund) => {
            acc[fund] = trans.filter(t => t.fund === fund && t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
            return acc;
          }, {});
          setFundTotals(fTotals);
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLiveStats();
  }, []);

  // ── Notifications ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchNotifications() {
      const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(20);
      setNotifications(data || []);
    }
    fetchNotifications();
    const channel = supabase
      .channel('notifications-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        setNotifications((prev) => [payload.new, ...prev]);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // ── Training submissions ──────────────────────────────────────────────────
  useEffect(() => {
    async function fetchTraining() {
      const { data: mods } = await supabase.from("discipleship_modules").select("*").order("order_index", { ascending: true });
      const { data: subs } = await supabase.from("discipleship_progress").select("*, discipleship_questions(question, order_index, module_id)").order("created_at", { ascending: false });
      if (subs && subs.length > 0) {
        const ids = [...new Set(subs.map(s => s.member_id))];
        const { data: profiles } = await supabase.from("profiles").select("id, email, full_name, role").in("id", ids);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });
        setMemberProfiles(profileMap);
      }
      setTrainingModules(mods || []);
      setSubmissions(subs || []);
    }
    fetchTraining();
  }, []);

  // ── Close notif on outside click ──────────────────────────────────────────
  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function markOneRead(id) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function handleReview(progressId, status) {
    setReviewing(p => ({ ...p, [progressId]: true }));
    const note = reviewNotes[progressId]?.trim() || null;
    await supabase.from("discipleship_progress").update({ status, notes: note, reviewed_at: new Date().toISOString(), reviewed_by: "Pastor" }).eq("id", progressId);
    setSubmissions(prev => prev.map(s => s.id === progressId ? { ...s, status, notes: note } : s));
    setReviewing(p => ({ ...p, [progressId]: false }));
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const unreadCount    = notifications.filter(n => !n.is_read).length;
  const attendanceRate = memberCount > 0 ? Math.round((activeMembers / memberCount) * 100) : 0;
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
    { label: "Attendance Rate",   value: loading ? "..." : `${attendanceRate}%`,               sub: "Based on active members",     icon: UserCheck,  color: A(dark, "indigo"), trend: "up"                        },
    { label: "Total Church Funds",value: loading ? "..." : `₱${totalFunds.toLocaleString()}`,  sub: "Live balance",                icon: HandCoins,  color: A(dark, "purple"), trend: totalFunds >= 0 ? "up" : "down" },
    { label: "Upcoming Events",   value: loading ? "..." : upcomingEvents.length.toString(),   sub: "From today onward",           icon: CalendarDays,color: A(dark, "pink"),  trend: "neutral"                   },
  ];

  // ─── Shared card classname builder ────────────────────────────────────────
  const card = `${t.cardBg} border ${t.cardBorder} rounded-3xl backdrop-blur-sm`;

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} ${t.textPrimary} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8 lg:mb-10">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}>GGCF-GMI · Pandi, Bulacan</p>
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
              {unreadCount > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-blue-600 rounded-full ring-2 ${dark ? "ring-[#0f111a]" : "ring-slate-200"} text-[10px] font-black text-white flex items-center justify-center`}>
                  {unreadCount > 9 ? "9+" : unreadCount}
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
                    {unreadCount > 0 && (
                      <span className="text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-bold">
                      <CheckCheck className="w-3 h-3" /> Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center">
                      <Bell className={`w-6 h-6 ${t.emptyIcon} mx-auto mb-2`} />
                      <p className={`text-xs ${t.textMuted}`}>No notifications yet.</p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const style = NOTIF_STYLE[n.type] || NOTIF_STYLE.member;
                      const Icon  = style.icon;
                      return (
                        <button
                          key={n.id}
                          onClick={() => markOneRead(n.id)}
                          className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b ${t.divider} border-opacity-50 last:border-0 hover:bg-slate-800/20 transition-colors ${!n.is_read ? style.bg : ""}`}
                        >
                          <div className={`mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${style.bg}`}>
                            <Icon className={`w-3.5 h-3.5 ${!n.is_read ? "text-white" : t.textSub}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-xs font-bold truncate ${!n.is_read ? t.textPrimary : t.textSub}`}>{n.title}</p>
                              {!n.is_read && <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${style.dot}`} />}
                            </div>
                            <p className={`text-[10px] ${t.textSub} mt-0.5 leading-relaxed line-clamp-2`}>{n.body}</p>
                            <p className={`text-[10px] ${t.textMuted} mt-1`}>
                              {new Date(n.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {notifications.length > 0 && (
                  <div className={`px-4 py-2.5 border-t ${t.divider} text-center`}>
                    <p className={`text-[10px] ${t.textMuted}`}>{notifications.length} total notifications</p>
                  </div>
                )}
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
            Showing results for <span className={`${t.textPrimary} font-bold`}>"{search}"</span>
            {" "}— {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}, {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? "s" : ""}, {activityFeed.length} activit{activityFeed.length !== 1 ? "ies" : "y"}
          </span>
          <button onClick={() => setSearch("")} className={`ml-auto ${t.textMuted} hover:text-slate-300 transition-colors`}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className={`flex gap-1 ${t.tabBar} border rounded-xl p-1 w-fit mb-8`}>
        {["overview", "finance", "ministries", "training"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-1.5 rounded-lg text-sm font-bold capitalize transition-all ${
              activeTab === tab ? "bg-blue-600 text-white shadow" : t.tabInactive
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === "overview" && (
        <div className="space-y-8">
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
      )}

      {/* ── FINANCE ── */}
      {activeTab === "finance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Balance",  value: totalFunds,   icon: HandCoins,    color: A(dark, "blue") },
              { label: "Total Income",   value: totalIncome,  icon: TrendingUp,   color: A(dark, "emerald") },
              { label: "Total Expenses", value: totalExpense, icon: TrendingDown, color: A(dark, "rose") },
            ].map((s) => (
              <div key={s.label} className={`${card} p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <p className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub}`}>{s.label}</p>
                </div>
                <p className={`text-2xl font-black font-mono ${s.color}`}>
                  {loading ? "..." : `₱${(s.value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                </p>
              </div>
            ))}
          </div>

          <div className={`${card} p-6`}>
            <h3 className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub} mb-5 border-b ${t.divider} pb-3`}>Fund Breakdown</h3>
            <div className="space-y-4 mb-6">
              {FUNDS.map((fund) => (
                <div key={fund} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${FUND_DOTS[fund]}`} />
                    <span className={t.textPrimary}>{fund}</span>
                  </div>
                  <span className={`font-black font-mono ${t.textPrimary}`}>
                    {loading ? "..." : `₱${(fundTotals[fund] || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                  </span>
                </div>
              ))}
            </div>
            <div className={`pt-4 border-t ${t.divider}`}>
              <p className={`text-xs ${t.textSub} mb-3`}>Remainder allocation after Monthly Budget:</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "General Fund", pct: "50%", color: A(dark, "blue") },
                  { label: "Project Fund", pct: "25%", color: A(dark, "purple") },
                  { label: "Lot Fund",     pct: "25%", color: A(dark, "pink") },
                ].map((item) => (
                  <div key={item.label} className={`${t.deepCard} rounded-2xl p-3 text-center`}>
                    <p className={`text-xl font-black ${item.color}`}>{item.pct}</p>
                    <p className={`text-[10px] ${t.textSub} mt-1 uppercase tracking-wider`}>{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${card} p-6`}>
            <div className={`flex items-center justify-between mb-5 border-b ${t.divider} pb-3`}>
              <h3 className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub}`}>
                Recent Transactions {q && <span className="ml-2 text-blue-400">· filtered</span>}
              </h3>
              <a href="/dashboard/finance" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                View all <ChevronRight className="w-3 h-3" />
              </a>
            </div>
            {loading ? (
              <p className={`${t.textMuted} text-sm text-center py-4`}>Syncing...</p>
            ) : filteredTransactions.length === 0 ? (
              <p className={`${t.textMuted} text-sm text-center py-4`}>{q ? `No transactions matching "${search}"` : "No transactions yet."}</p>
            ) : (
              <div className="space-y-3">
                {filteredTransactions.map((tx, i) => (
                  <div key={i} className={`flex items-center justify-between py-2 border-b ${t.txBorder} last:border-0`}>
                    <div>
                      <p className={`text-sm font-semibold ${t.textPrimary}`}>{tx.category}</p>
                      <p className={`text-[10px] ${t.textMuted}`}>{tx.fund || '—'} · {tx.member || '—'}</p>
                    </div>
                    <p className={`text-sm font-black font-mono ${tx.type === 'income' ? A(dark, "emerald") : A(dark, "rose")}`}>
                      {tx.type === 'expense' ? '−' : '+'}₱{(Number(tx.amount) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MINISTRIES ── */}
      {activeTab === "ministries" && (
        <div className="space-y-4">
          {MINISTRIES.map((m) => (
            <div key={m.name} className={`${card} p-5 flex items-center justify-between hover:border-slate-600 transition-colors cursor-pointer group`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-black text-blue-400">{m.initials}</span>
                </div>
                <div>
                  <p className={`text-sm font-bold ${t.textPrimary}`}>{m.name}</p>
                  <p className={`text-xs ${t.textSub} mt-0.5`}>Head: {m.head}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className={`text-sm font-black ${t.textPrimary}`}>{m.members}</p>
                  <p className={`text-[10px] ${t.textMuted} uppercase tracking-wider`}>members</p>
                </div>
                <ChevronRight className={`w-4 h-4 ${t.textMuted} group-hover:text-slate-400 transition-colors`} />
              </div>
            </div>
          ))}
          <div className={`${t.cardBg} border border-dashed ${t.dashed} rounded-3xl p-6 text-center`}>
            <BookOpen className={`w-5 h-5 ${t.emptyIcon} mx-auto mb-2`} />
            <p className={`text-xs ${t.textMuted}`}>Training records and discipleship tracking coming soon.</p>
          </div>
        </div>
      )}

      {/* ── TRAINING ── */}
      {activeTab === "training" && (() => {
        const byMember = submissions.reduce((acc, s) => {
          if (!acc[s.member_id]) acc[s.member_id] = [];
          acc[s.member_id].push(s);
          return acc;
        }, {});

        return (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Submissions", value: submissions.length,                                       color: t.textPrimary     },
                { label: "Pending Review",    value: submissions.filter(s => s.status === "pending").length,  color: A(dark, "yellow")  },
                { label: "Approved",          value: submissions.filter(s => s.status === "approved").length, color: A(dark, "emerald") },
              ].map(s => (
                <div key={s.label} className={`${card} p-5`}>
                  <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-2`}>{s.label}</p>
                  <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {submissions.length === 0 && (
              <div className={`py-16 text-center border border-dashed ${t.dashed} rounded-3xl`}>
                <BookOpen className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-3`} />
                <p className={`${t.textMuted} text-sm`}>No submissions yet.</p>
                <p className={`${t.textMuted} text-xs mt-1 opacity-60`}>Members will appear here once they submit their answers.</p>
              </div>
            )}

            {Object.entries(byMember).map(([memberId, subs]) => {
              const profile     = memberProfiles[memberId];
              const displayName = profile?.full_name || profile?.email?.split("@")[0] || `Member ...${memberId.slice(-6)}`;
              const pending     = subs.filter(s => s.status === "pending").length;
              const approved    = subs.filter(s => s.status === "approved").length;
              const isOpen      = expandedMember === memberId;

              const byModule = subs.reduce((acc, s) => {
                const modId = s.discipleship_questions?.module_id || s.module_id;
                if (!acc[modId]) acc[modId] = [];
                acc[modId].push(s);
                return acc;
              }, {});

              return (
                <div key={memberId} className={`${card} overflow-hidden`}>
                  <button
                    onClick={() => setExpandedMember(isOpen ? null : memberId)}
                    className={`w-full flex items-center justify-between gap-4 p-5 ${t.hoverRow} transition-colors`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-black text-blue-400">
                          {displayName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className={`text-sm font-bold ${t.textPrimary}`}>{displayName}</p>
                        <p className={`text-xs ${t.textSub} mt-0.5`}>{subs.length} answer{subs.length !== 1 ? "s" : ""} submitted</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {pending > 0 && <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">{pending} pending</span>}
                      {approved > 0 && <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">{approved} approved</span>}
                      {isOpen ? <ChevronDown className={`w-4 h-4 ${t.textSub}`} /> : <ChevronRight className={`w-4 h-4 ${t.textMuted}`} />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className={`border-t ${t.divider} px-5 py-4 space-y-3`}>
                      {Object.entries(byModule).map(([modId, modSubs]) => {
                        const mod        = trainingModules.find(m => m.id === Number(modId));
                        const modOpen    = expandedModReview === `${memberId}-${modId}`;
                        const modPending = modSubs.filter(s => s.status === "pending").length;

                        return (
                          <div key={modId} className={`${t.innerCard} border ${t.innerBorder} rounded-2xl overflow-hidden`}>
                            <button
                              onClick={() => setExpandedModReview(modOpen ? null : `${memberId}-${modId}`)}
                              className={`w-full flex items-center justify-between gap-3 px-4 py-3 ${t.hoverRow} transition-colors`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <p className={`text-sm font-bold ${t.textPrimary} truncate`}>{mod?.title || `Module ${modId}`}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {modPending > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-yellow-500/15 text-yellow-400">{modPending} pending</span>}
                                {modOpen ? <ChevronDown className={`w-3.5 h-3.5 ${t.textSub}`} /> : <ChevronRight className={`w-3.5 h-3.5 ${t.textMuted}`} />}
                              </div>
                            </button>

                            {modOpen && (
                              <div className={`border-t ${t.innerBorder} px-4 py-4 space-y-5`}>
                                {modSubs
                                  .sort((a, b) => (a.discipleship_questions?.order_index || 0) - (b.discipleship_questions?.order_index || 0))
                                  .map((sub, qi) => {
                                    const isReviewing = reviewing[sub.id];
                                    return (
                                      <div key={sub.id} className="space-y-2">
                                        <p className={`text-xs font-bold ${t.textSub}`}>
                                          <span className="text-blue-400 mr-1">Q{qi + 1}.</span>
                                          {sub.discipleship_questions?.question || "—"}
                                        </p>
                                        <div className={`${dark ? "bg-[#0f111a]" : "bg-slate-200"} border ${t.innerBorder} rounded-xl px-4 py-3`}>
                                          <p className={`text-sm ${t.textPrimary} leading-relaxed`}>{sub.answer}</p>
                                          <p className={`text-[10px] ${t.textMuted} mt-2`}>
                                            Submitted {sub.created_at ? new Date(sub.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                                          </p>
                                        </div>

                                        {sub.status === "approved" ? (
                                          <div className={`flex items-center gap-2 text-xs ${A(dark, "emerald")} font-bold`}>
                                            <CheckCircle className="w-3.5 h-3.5" /> Approved
                                            {sub.notes && <span className={`${t.textSub} font-normal ml-1`}>· Note: {sub.notes}</span>}
                                          </div>
                                        ) : sub.status === "rejected" ? (
                                          <div className="space-y-1.5">
                                            <div className={`flex items-center gap-2 text-xs ${A(dark, "rose")} font-bold`}>
                                              <XCircle className="w-3.5 h-3.5" /> Rejected
                                              {sub.notes && <span className={`${t.textSub} font-normal ml-1`}>· Note: {sub.notes}</span>}
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                              <button onClick={() => handleReview(sub.id, "approved")} disabled={isReviewing} className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                <CheckCircle className="w-3 h-3" /> Approve
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="space-y-2 pt-1">
                                            <div className={`flex items-center gap-1.5 text-xs ${A(dark, "yellow")} font-bold mb-2`}>
                                              <Clock className="w-3.5 h-3.5" /> Awaiting Review
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <MessageSquare className={`w-3.5 h-3.5 ${t.textMuted} shrink-0`} />
                                              <input
                                                type="text"
                                                placeholder="Add note (optional, shown to member if rejected)"
                                                value={reviewNotes[sub.id] || ""}
                                                onChange={(e) => setReviewNotes(p => ({ ...p, [sub.id]: e.target.value }))}
                                                className={`flex-1 ${dark ? "bg-[#0f111a]" : "bg-slate-50"} border ${t.inputBorder} rounded-xl px-3 py-2 text-xs ${t.textPrimary} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
                                              />
                                            </div>
                                            <div className="flex gap-2">
                                              <button onClick={() => handleReview(sub.id, "approved")} disabled={isReviewing} className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
                                                <CheckCircle className="w-3.5 h-3.5" /> {isReviewing ? "Saving..." : "Approve"}
                                              </button>
                                              <button onClick={() => handleReview(sub.id, "rejected")} disabled={isReviewing} className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
                                                <XCircle className="w-3.5 h-3.5" /> {isReviewing ? "Saving..." : "Reject"}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

    </div>
  );
}