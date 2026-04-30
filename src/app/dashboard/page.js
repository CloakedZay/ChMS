"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
  Users, Bell, Search, TrendingUp, UserCheck,
  CalendarDays, HandCoins, ChevronRight,
  ArrowUpRight, BookOpen, TrendingDown, X,
  CheckCheck, Zap, CheckCircle, XCircle, Clock,
  ChevronDown, MessageSquare
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState("overview");
  const [search, setSearch]             = useState("");
  const [showNotifs, setShowNotifs]     = useState(false);
  const notifRef                        = useRef(null);

  // ── DB states ────────────────────────────────────────────────────────────
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

  // ── Training review states ────────────────────────────────────────────────
  const [trainingModules, setTrainingModules]   = useState([]);
  const [submissions, setSubmissions]           = useState([]); // all progress rows
  const [memberProfiles, setMemberProfiles]     = useState({}); // { [member_id]: email }
  const [expandedMember, setExpandedMember]     = useState(null);
  const [expandedModReview, setExpandedModReview] = useState(null);
  const [reviewNotes, setReviewNotes]           = useState({}); // { [progress_id]: text }
  const [reviewing, setReviewing]               = useState({}); // { [progress_id]: bool }

  // ── Fetch all live data ───────────────────────────────────────────────────
  useEffect(() => {
    async function fetchLiveStats() {
      setLoading(true);
      try {
        const { count: mCount } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true });

        const { count: aCount } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        const { data: latestMembers } = await supabase
          .from('members')
          .select('full_name, status, ministry')
          .order('id', { ascending: false })
          .limit(3);

        const { data: trans } = await supabase
          .from('transactions')
          .select('amount, type, fund, category, member, date')
          .order('date', { ascending: false });

        const { data: evts } = await supabase
          .from('events')
          .select('*')
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true })
          .limit(4);

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
            acc[fund] = trans
              .filter(t => t.fund === fund && t.type === 'income')
              .reduce((s, t) => s + (Number(t.amount) || 0), 0);
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

  // ── Fetch notifications ───────────────────────────────────────────────────
  useEffect(() => {
    async function fetchNotifications() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setNotifications(data || []);
    }

    fetchNotifications();

    // Real-time: new notifications appear instantly via Supabase channel
    const channel = supabase
      .channel('notifications-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          setNotifications((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── Fetch training submissions ────────────────────────────────────────────
  useEffect(() => {
    async function fetchTraining() {
      const { data: mods } = await supabase
        .from("discipleship_modules")
        .select("*")
        .order("order_index", { ascending: true });

      const { data: subs } = await supabase
        .from("discipleship_progress")
        .select("*, discipleship_questions(question, order_index, module_id)")
        .order("created_at", { ascending: false });

      // Get unique member_ids then fetch their emails from auth.users via profiles
      if (subs && subs.length > 0) {
        const ids = [...new Set(subs.map(s => s.member_id))];
        const { data: profiles } = await supabase
          .from("members")
          .select("id, full_name, email")
          .in("auth_id", ids); // adjust column name if yours differs

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.auth_id || p.id] = p; });
        setMemberProfiles(profileMap);
      }

      setTrainingModules(mods || []);
      setSubmissions(subs || []);
    }
    fetchTraining();
  }, []);

  // ── Close notif panel on outside click ───────────────────────────────────
  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Mark all as read ─────────────────────────────────────────────────────
  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  // ── Mark single as read ──────────────────────────────────────────────────
  async function markOneRead(id) {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  // ── Review actions ────────────────────────────────────────────────────────
  async function handleReview(progressId, status) {
    setReviewing(p => ({ ...p, [progressId]: true }));
    const note = reviewNotes[progressId]?.trim() || null;
    await supabase
      .from("discipleship_progress")
      .update({ status, notes: note, reviewed_at: new Date().toISOString(), reviewed_by: "Pastor" })
      .eq("id", progressId);
    setSubmissions(prev =>
      prev.map(s => s.id === progressId ? { ...s, status, notes: note } : s)
    );
    setReviewing(p => ({ ...p, [progressId]: false }));
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const unreadCount     = notifications.filter(n => !n.is_read).length;
  const attendanceRate  = memberCount > 0 ? Math.round((activeMembers / memberCount) * 100) : 0;
  const q               = search.toLowerCase().trim();

  // Filtered events (by title or ministry)
  const filteredEvents = upcomingEvents.filter(ev =>
    !q ||
    ev.title?.toLowerCase().includes(q) ||
    ev.ministry?.toLowerCase().includes(q) ||
    ev.status?.toLowerCase().includes(q)
  );

  // Filtered transactions (by category, fund, or member)
  const filteredTransactions = recentTransactions.filter(tx =>
    !q ||
    tx.category?.toLowerCase().includes(q) ||
    tx.fund?.toLowerCase().includes(q) ||
    tx.member?.toLowerCase().includes(q) ||
    tx.type?.toLowerCase().includes(q)
  );

  // Activity feed
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
  ].filter(a =>
    !q ||
    a.text.toLowerCase().includes(q) ||
    a.type.toLowerCase().includes(q)
  ).slice(0, 6);

  const STATS = [
    {
      label: "Active Members",
      value: loading ? "..." : memberCount.toString(),
      sub: `${activeMembers} active`,
      icon: Users, color: "text-blue-400", trend: "up",
    },
    {
      label: "Attendance Rate",
      value: loading ? "..." : `${attendanceRate}%`,
      sub: "Based on active members",
      icon: UserCheck, color: "text-indigo-400", trend: "up",
    },
    {
      label: "Total Church Funds",
      value: loading ? "..." : `₱${totalFunds.toLocaleString()}`,
      sub: "Live balance",
      icon: HandCoins, color: "text-purple-400", trend: totalFunds >= 0 ? "up" : "down",
    },
    {
      label: "Upcoming Events",
      value: loading ? "..." : upcomingEvents.length.toString(),
      sub: "From today onward",
      icon: CalendarDays, color: "text-pink-400", trend: "neutral",
    },
  ];

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 min-h-screen bg-[#0f111a] text-slate-100">

      {/* Header */}
      <div className="flex justify-between items-start mb-10">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h2 className="text-2xl font-black text-white">Dashboard Overview</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {loading ? "Syncing with Supabase..." : "Live data from all church modules."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search events, funds, members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#1a1d2e] border border-slate-800 rounded-full py-2 pl-9 pr-9 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 w-64 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Notifications bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifs((v) => !v)}
              className="relative p-2 bg-[#1a1d2e] rounded-full border border-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-blue-600 rounded-full ring-2 ring-[#0f111a] text-[10px] font-black text-white flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification panel */}
            {showNotifs && (
              <div className="absolute right-0 top-12 w-80 bg-[#1a1d2e] border border-slate-800 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-bold"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Notification list */}
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center">
                      <Bell className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                      <p className="text-xs text-slate-600">No notifications yet.</p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const style = NOTIF_STYLE[n.type] || NOTIF_STYLE.member;
                      const Icon  = style.icon;
                      return (
                        <button
                          key={n.id}
                          onClick={() => markOneRead(n.id)}
                          className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/40 transition-colors ${!n.is_read ? style.bg : ""}`}
                        >
                          <div className={`mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${style.bg}`}>
                            <Icon className={`w-3.5 h-3.5 ${!n.is_read ? "text-white" : "text-slate-500"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-xs font-bold truncate ${!n.is_read ? "text-white" : "text-slate-400"}`}>
                                {n.title}
                              </p>
                              {!n.is_read && (
                                <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${style.dot}`} />
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                            <p className="text-[10px] text-slate-700 mt-1">
                              {new Date(n.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                {notifications.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-slate-800 text-center">
                    <p className="text-[10px] text-slate-600">{notifications.length} total notifications</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search result banner */}
      {q && (
        <div className="mb-6 flex items-center gap-2 text-sm text-slate-400 bg-[#1a1d2e]/60 border border-slate-800 rounded-xl px-4 py-2.5">
          <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>
            Showing results for <span className="text-white font-bold">"{search}"</span>
            {" "}— {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}, {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? "s" : ""}, {activityFeed.length} activit{activityFeed.length !== 1 ? "ies" : "y"}
          </span>
          <button onClick={() => setSearch("")} className="ml-auto text-slate-600 hover:text-slate-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1d2e]/60 border border-slate-800 rounded-xl p-1 w-fit mb-8">
        {["overview", "finance", "ministries", "training"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-1.5 rounded-lg text-sm font-bold capitalize transition-all ${
              activeTab === tab ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:text-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <div className="space-y-8">

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {STATS.map((s) => (
              <div key={s.label} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm hover:border-slate-700 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{s.label}</p>
                  <s.icon className="w-4 h-4 text-slate-700" />
                </div>
                <p className={`text-3xl font-black mb-1 ${s.color}`}>{s.value}</p>
                <p className={`text-xs flex items-center gap-1 font-medium ${s.trend === "up" ? "text-emerald-400" : "text-slate-600"}`}>
                  {s.trend === "up" && <ArrowUpRight className="w-3 h-3" />}
                  {s.sub}
                </p>
              </div>
            ))}
          </div>

          {/* Next Schedule + Activity Log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Next Schedule */}
            <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
                <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                  Next Schedule
                  {q && <span className="ml-2 text-blue-400">· filtered</span>}
                </h3>
                <a href="/dashboard/events" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                  View all <ChevronRight className="w-3 h-3" />
                </a>
              </div>
              {loading ? (
                <p className="text-slate-600 text-sm text-center py-8">Syncing...</p>
              ) : filteredEvents.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl">
                  <CalendarDays className="w-8 h-8 text-slate-800 mx-auto mb-2" />
                  <p className="text-xs text-slate-600">
                    {q ? `No events matching "${search}"` : "No upcoming events found."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredEvents.map((ev) => (
                    <div key={ev.id} className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-slate-900/50 hover:bg-slate-800/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{ev.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {ev.date
                            ? new Date(ev.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'No date'}
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
            <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
              <div className="mb-5 border-b border-slate-800 pb-3">
                <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                  Activity Log
                  {q && <span className="ml-2 text-blue-400">· filtered</span>}
                </h3>
              </div>
              {loading ? (
                <p className="text-slate-600 text-sm text-center py-8">Syncing...</p>
              ) : activityFeed.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl">
                  <TrendingUp className="w-8 h-8 text-slate-800 mx-auto mb-2" />
                  <p className="text-xs text-slate-600">
                    {q ? `No activity matching "${search}"` : "No recent activities logged."}
                  </p>
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
                          <p className="text-xs text-slate-300 leading-relaxed">{a.text}</p>
                          <p className="text-[10px] text-slate-600 mt-0.5">{a.time}</p>
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

      {/* ── FINANCE TAB ── */}
      {activeTab === "finance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Balance",  value: totalFunds,   icon: HandCoins,    color: "text-blue-400" },
              { label: "Total Income",   value: totalIncome,  icon: TrendingUp,   color: "text-emerald-400" },
              { label: "Total Expenses", value: totalExpense, icon: TrendingDown, color: "text-rose-400" },
            ].map((s) => (
              <div key={s.label} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-5 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{s.label}</p>
                </div>
                <p className={`text-2xl font-black font-mono ${s.color}`}>
                  {loading ? "..." : `₱${(s.value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
            <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-5 border-b border-slate-800 pb-3">
              Fund Breakdown
            </h3>
            <div className="space-y-4 mb-6">
              {FUNDS.map((fund) => (
                <div key={fund} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${FUND_DOTS[fund]}`} />
                    <span className="text-slate-300">{fund}</span>
                  </div>
                  <span className="font-black font-mono text-white">
                    {loading ? "..." : `₱${(fundTotals[fund] || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 mb-3">Remainder allocation after Monthly Budget:</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "General Fund", pct: "50%", color: "text-blue-400" },
                  { label: "Project Fund", pct: "25%", color: "text-purple-400" },
                  { label: "Lot Fund",     pct: "25%", color: "text-pink-400" },
                ].map((item) => (
                  <div key={item.label} className="bg-slate-900/60 rounded-2xl p-3 text-center">
                    <p className={`text-xl font-black ${item.color}`}>{item.pct}</p>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Transactions — filtered by search */}
          <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                Recent Transactions
                {q && <span className="ml-2 text-blue-400">· filtered</span>}
              </h3>
              <a href="/dashboard/finance" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                View all <ChevronRight className="w-3 h-3" />
              </a>
            </div>
            {loading ? (
              <p className="text-slate-600 text-sm text-center py-4">Syncing...</p>
            ) : filteredTransactions.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-4">
                {q ? `No transactions matching "${search}"` : "No transactions yet."}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredTransactions.map((tx, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800/30 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-white">{tx.category}</p>
                      <p className="text-[10px] text-slate-600">{tx.fund || '—'} · {tx.member || '—'}</p>
                    </div>
                    <p className={`text-sm font-black font-mono ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.type === 'expense' ? '−' : '+'}₱{(Number(tx.amount) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MINISTRIES TAB ── */}
      {activeTab === "ministries" && (
        <div className="space-y-4">
          {MINISTRIES.map((m) => (
            <div key={m.name} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-5 flex items-center justify-between hover:border-slate-700 transition-colors cursor-pointer group backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-black text-blue-400">{m.initials}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{m.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Head: {m.head}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-black text-white">{m.members}</p>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">members</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors" />
              </div>
            </div>
          ))}
          <div className="bg-[#1a1d2e]/30 border border-dashed border-slate-800 rounded-3xl p-6 text-center">
            <BookOpen className="w-5 h-5 text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-700">Training records and discipleship tracking coming soon.</p>
          </div>
        </div>
      )}

      {/* ── TRAINING TAB ── */}
      {activeTab === "training" && (() => {
        // Group submissions by member_id
        const byMember = submissions.reduce((acc, s) => {
          if (!acc[s.member_id]) acc[s.member_id] = [];
          acc[s.member_id].push(s);
          return acc;
        }, {});

        const pendingTotal = submissions.filter(s => s.status === "pending").length;

        return (
          <div className="space-y-5">

            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Submissions", value: submissions.length,                                          color: "text-white"        },
                { label: "Pending Review",    value: submissions.filter(s => s.status === "pending").length,     color: "text-yellow-400"   },
                { label: "Approved",          value: submissions.filter(s => s.status === "approved").length,    color: "text-emerald-400"  },
              ].map(s => (
                <div key={s.label} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-5 backdrop-blur-sm">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">{s.label}</p>
                  <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* No submissions */}
            {submissions.length === 0 && (
              <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl">
                <BookOpen className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">No submissions yet.</p>
                <p className="text-slate-700 text-xs mt-1">Members will appear here once they submit their answers.</p>
              </div>
            )}

            {/* Members with submissions */}
            {Object.entries(byMember).map(([memberId, subs]) => {
              const profile     = memberProfiles[memberId];
              const displayName = profile?.full_name || profile?.email || `Member ${memberId.slice(0, 6)}`;
              const pending     = subs.filter(s => s.status === "pending").length;
              const approved    = subs.filter(s => s.status === "approved").length;
              const isOpen      = expandedMember === memberId;

              // Group this member's subs by module
              const byModule = subs.reduce((acc, s) => {
                const modId = s.discipleship_questions?.module_id || s.module_id;
                if (!acc[modId]) acc[modId] = [];
                acc[modId].push(s);
                return acc;
              }, {});

              return (
                <div key={memberId} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl overflow-hidden backdrop-blur-sm">

                  {/* Member row */}
                  <button
                    onClick={() => setExpandedMember(isOpen ? null : memberId)}
                    className="w-full flex items-center justify-between gap-4 p-5 hover:bg-slate-800/20 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-black text-blue-400">
                          {displayName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-white">{displayName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{subs.length} answer{subs.length !== 1 ? "s" : ""} submitted</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {pending > 0 && (
                        <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                          {pending} pending
                        </span>
                      )}
                      {approved > 0 && (
                        <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          {approved} approved
                        </span>
                      )}
                      {isOpen
                        ? <ChevronDown className="w-4 h-4 text-slate-500" />
                        : <ChevronRight className="w-4 h-4 text-slate-700" />
                      }
                    </div>
                  </button>

                  {/* Expanded: modules */}
                  {isOpen && (
                    <div className="border-t border-slate-800/60 px-5 py-4 space-y-3">
                      {Object.entries(byModule).map(([modId, modSubs]) => {
                        const mod       = trainingModules.find(m => m.id === Number(modId));
                        const modOpen   = expandedModReview === `${memberId}-${modId}`;
                        const modPending = modSubs.filter(s => s.status === "pending").length;

                        return (
                          <div key={modId} className="bg-slate-900/40 border border-slate-800/40 rounded-2xl overflow-hidden">

                            {/* Module row */}
                            <button
                              onClick={() => setExpandedModReview(modOpen ? null : `${memberId}-${modId}`)}
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <p className="text-sm font-bold text-white truncate">
                                  {mod?.title || `Module ${modId}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {modPending > 0 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-yellow-500/15 text-yellow-400">
                                    {modPending} pending
                                  </span>
                                )}
                                {modOpen
                                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                                }
                              </div>
                            </button>

                            {/* Answers */}
                            {modOpen && (
                              <div className="border-t border-slate-800/40 px-4 py-4 space-y-5">
                                {modSubs
                                  .sort((a, b) => (a.discipleship_questions?.order_index || 0) - (b.discipleship_questions?.order_index || 0))
                                  .map((sub, qi) => {
                                    const isReviewing = reviewing[sub.id];
                                    return (
                                      <div key={sub.id} className="space-y-2">

                                        {/* Question */}
                                        <p className="text-xs font-bold text-slate-400">
                                          <span className="text-blue-400 mr-1">Q{qi + 1}.</span>
                                          {sub.discipleship_questions?.question || "—"}
                                        </p>

                                        {/* Answer bubble */}
                                        <div className="bg-[#0f111a] border border-slate-800 rounded-xl px-4 py-3">
                                          <p className="text-sm text-slate-200 leading-relaxed">{sub.answer}</p>
                                          <p className="text-[10px] text-slate-600 mt-2">
                                            Submitted {sub.created_at ? new Date(sub.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                                          </p>
                                        </div>

                                        {/* Status + actions */}
                                        {sub.status === "approved" ? (
                                          <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
                                            <CheckCircle className="w-3.5 h-3.5" /> Approved
                                            {sub.notes && <span className="text-slate-500 font-normal ml-1">· Note: {sub.notes}</span>}
                                          </div>
                                        ) : sub.status === "rejected" ? (
                                          <div className="space-y-1.5">
                                            <div className="flex items-center gap-2 text-xs text-rose-400 font-bold">
                                              <XCircle className="w-3.5 h-3.5" /> Rejected
                                              {sub.notes && <span className="text-slate-500 font-normal ml-1">· Note: {sub.notes}</span>}
                                            </div>
                                            {/* Allow re-review */}
                                            <div className="flex gap-2 pt-1">
                                              <button
                                                onClick={() => handleReview(sub.id, "approved")}
                                                disabled={isReviewing}
                                                className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                              >
                                                <CheckCircle className="w-3 h-3" /> Approve
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          /* Pending — show review controls */
                                          <div className="space-y-2 pt-1">
                                            <div className="flex items-center gap-1.5 text-xs text-yellow-400 font-bold mb-2">
                                              <Clock className="w-3.5 h-3.5" /> Awaiting Review
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <MessageSquare className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                              <input
                                                type="text"
                                                placeholder="Add note (optional, shown to member if rejected)"
                                                value={reviewNotes[sub.id] || ""}
                                                onChange={(e) => setReviewNotes(p => ({ ...p, [sub.id]: e.target.value }))}
                                                className="flex-1 bg-[#0f111a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                                              />
                                            </div>
                                            <div className="flex gap-2">
                                              <button
                                                onClick={() => handleReview(sub.id, "approved")}
                                                disabled={isReviewing}
                                                className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                                              >
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                {isReviewing ? "Saving..." : "Approve"}
                                              </button>
                                              <button
                                                onClick={() => handleReview(sub.id, "rejected")}
                                                disabled={isReviewing}
                                                className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                                              >
                                                <XCircle className="w-3.5 h-3.5" />
                                                {isReviewing ? "Saving..." : "Reject"}
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