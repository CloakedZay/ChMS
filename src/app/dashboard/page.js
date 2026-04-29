"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Users, Bell, Search, TrendingUp, UserCheck,
  CalendarDays, HandCoins, ChevronRight,
  ArrowUpRight, BookOpen, TrendingDown, X
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
  member:  { bg: "bg-blue-500/20 text-blue-400",      label: "M" },
  finance: { bg: "bg-emerald-500/20 text-emerald-400", label: "₱" },
  event:   { bg: "bg-violet-500/20 text-violet-400",   label: "E" },
};

// ─── Notification Types ───────────────────────────────────────────────────────
const NOTIFICATION_TYPES = {
  member_added: { icon: "👤", color: "text-blue-400", title: "New Member Added" },
  transaction:  { icon: "💰", color: "text-emerald-400", title: "New Transaction" },
  event_added:  { icon: "📅", color: "text-purple-400", title: "New Event Created" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  
  // ── Notification State ────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // ── Real database states ──────────────────────────────────────────────────
  const [memberCount, setMemberCount]   = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);
  const [totalFunds, setTotalFunds]     = useState(0);
  const [totalIncome, setTotalIncome]   = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [fundTotals, setFundTotals]     = useState({});
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [recentMembers, setRecentMembers] = useState([]);

  // ── Supabase Realtime Subscriptions ───────────────────────────────────────
  useEffect(() => {
    let memberChannel, transactionChannel, eventChannel;

    // Subscribe to new members
    memberChannel = supabase
      .channel('members')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'members' }, 
        (payload) => {
          handleNewNotification('member_added', payload.new);
          setMemberCount(prev => prev + 1);
          if (payload.new.status === 'active') {
            setActiveMembers(prev => prev + 1);
          }
          setRecentMembers(prev => [payload.new, ...prev.slice(0, 2)]);
        }
      )
      .subscribe();

    // Subscribe to new transactions
    transactionChannel = supabase
      .channel('transactions')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'transactions' }, 
        (payload) => {
          handleNewNotification('transaction', payload.new);
          updateFinancialStats(payload.new);
        }
      )
      .subscribe();

    // Subscribe to new events
    eventChannel = supabase
      .channel('events')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'events' }, 
        (payload) => {
          handleNewNotification('event_added', payload.new);
          if (new Date(payload.new.date) >= new Date()) {
            setUpcomingEvents(prev => [payload.new, ...prev.slice(0, 3)]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(memberChannel);
      supabase.removeChannel(transactionChannel);
      supabase.removeChannel(eventChannel);
    };
  }, []);

  // ── Handle New Notifications ──────────────────────────────────────────────
  const handleNewNotification = (type, data) => {
    const notification = {
      id: Date.now() + Math.random(),
      type,
      data,
      timestamp: new Date().toISOString(),
      read: false,
      ...NOTIFICATION_TYPES[type]
    };

    setNotifications(prev => [notification, ...prev.slice(0, 9)]); // Keep last 10
    setUnreadCount(prev => prev + 1);
    
    // Optional: Play notification sound
    const audio = new Audio('/notification.mp3'); // Add sound file to public/
    audio.play().catch(() => {}); // Silent fail if no sound
    
    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: formatNotificationBody(type, data),
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      });
    }
  };

  const formatNotificationBody = (type, data) => {
    switch (type) {
      case 'member_added':
        return `${data.full_name || 'New member'} joined ${data.ministry || 'the church'}`;
      case 'transaction':
        const amount = Number(data.amount || 0).toLocaleString('en-PH');
        return `${data.type?.toUpperCase()} ₱${amount} - ${data.category || 'Transaction'}`;
      case 'event_added':
        return `${data.title || 'New event'} on ${data.date || 'TBD'}`;
      default:
        return 'New activity detected';
    }
  };

  // ── Update Financial Stats on New Transaction ─────────────────────────────
  const updateFinancialStats = (newTx) => {
    const amount = Number(newTx.amount) || 0;
    if (newTx.type === 'income') {
      setTotalIncome(prev => prev + amount);
      setFundTotals(prev => ({
        ...prev,
        [newTx.fund || 'General Fund']: (prev[newTx.fund || 'General Fund'] || 0) + amount
      }));
    } else {
      setTotalExpense(prev => prev + amount);
    }
    setTotalFunds(prev => prev + (newTx.type === 'income' ? amount : -amount));
    
    setRecentTransactions(prev => [newTx, ...prev.slice(0, 4)]);
  };

  // ── Initial Data Fetch ────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchLiveStats() {
      setLoading(true);
      try {
        // Load existing notifications from localStorage
        const saved = localStorage.getItem('church_notifications');
        if (saved) {
          const parsed = JSON.parse(saved);
          setNotifications(parsed.notifications || []);
          setUnreadCount(parsed.unreadCount || 0);
        }

        // 1. Member count + active count
        const { count: mCount } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true });

        const { count: aCount } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        // 2. Latest members
        const { data: latestMembers } = await supabase
          .from('members')
          .select('full_name, status, ministry')
          .order('created_at', { ascending: false })
          .limit(3);

        // 3. Transactions
        const { data: trans } = await supabase
          .from('transactions')
          .select('amount, type, fund, category, member, date, created_at')
          .order('created_at', { ascending: false })
          .limit(20);

        // 4. Upcoming events
        const { data: evts } = await supabase
          .from('events')
          .select('*')
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true })
          .limit(4);

        // Compute stats
        setMemberCount(mCount || 0);
        setActiveMembers(aCount || 0);
        setUpcomingEvents(evts || []);
        setRecentMembers(latestMembers || []);

        if (trans?.length) {
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

  // ── Save notifications to localStorage ────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('church_notifications', JSON.stringify({
      notifications,
      unreadCount,
      timestamp: new Date().toISOString()
    }));
  }, [notifications, unreadCount]);

  // ── Mark as Read ──────────────────────────────────────────────────────────
  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const markAsRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const attendanceRate = memberCount > 0 ? Math.round((activeMembers / memberCount) * 100) : 0;

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

  // Build activity feed from real data
  const activityFeed = [
    ...recentTransactions.slice(0, 3).map((t) => ({
      type: "finance",
      text: `${t.type === 'income' ? 'Income' : 'Expense'}: ${t.category} — ₱${Number(t.amount).toLocaleString()}`,
      time: t.date || t.created_at ? new Date(t.created_at || t.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : "—",
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
  ].slice(0, 6);

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 min-h-screen bg-[#0f111a] text-slate-100">

      {/* Header */}
      <div className="flex justify-between items-start mb-10">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h2 className="text-2xl font-black text-white">Dashboard Overview</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {loading ? "Syncing with Supabase..." : `Live data + ${unreadCount} unread notifications`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#1a1d2e] border border-slate-800 rounded-full py-2 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 w-48 transition-colors"
            />
          </div>
          
          {/* ── Notification Bell ── */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2.5 bg-[#1a1d2e] rounded-full border-2 border-slate-800 text-slate-400 hover:text-white hover:border-blue-500 hover:bg-blue-500/10 transition-all duration-200 group focus:outline-none focus:border-blue-500"
            >
              <Bell size={20} className="group-hover:rotate-12 transition-transform duration-200" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-gradient-to-r from-blue-500 to-indigo-500 text-xs font-black rounded-full flex items-center justify-center text-white shadow-lg ring-2 ring-[#0f111a] animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowNotifications(false)}
                />
                {/* Dropdown */}
                <div className="absolute top-14 right-0 w-96 bg-[#1a1d2e]/95 backdrop-blur-2xl border border-slate-700/60 rounded-3xl shadow-2xl shadow-black/60 z-50 animate-in slide-in-from-top-4 fade-in duration-200 max-h-[500px]">
                  <div className="p-5 border-b border-slate-800/50 flex items-center justify-between sticky top-0 bg-[#1a1d2e]/50 backdrop-blur-sm z-10">
                    <h3 className="font-black text-lg text-white flex items-center gap-2">
                      🔔 Notifications
                    </h3>
                    {notifications.length > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-bold px-3 py-1.5 rounded-xl border border-blue-500/30 hover:border-blue-400 transition-all duration-200"
                      >
                        Mark all read ({unreadCount})
                      </button>
                    )}
                  </div>
                  
                  <div className="overflow-y-auto max-h-[400px]">
                    {notifications.length === 0 ? (
                      <div className="p-12 text-center text-slate-600">
                        <Bell className="w-12 h-12 mx-auto mb-4 text-slate-700 animate-pulse" />
                        <p className="text-lg font-medium mb-1">All caught up!</p>
                        <p className="text-sm">Real-time updates will appear here</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-5 border-b border-slate-800/30 hover:bg-slate-800/50 transition-all duration-200 cursor-pointer group ${
                            !notif.read 
                              ? 'bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-l-4 border-blue-500/40 shadow-sm shadow-blue-500/20' 
                              : 'hover:border-l-blue-500/20'
                          }`}
                          onClick={() => markAsRead(notif.id)}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-white/20 to-transparent backdrop-blur-sm flex items-center justify-center shadow-lg ${notif.color}`}>
                              <span className="text-2xl font-black drop-shadow-sm">{notif.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-1">
                                <p className={`text-sm font-black ${notif.color} group-hover:scale-[1.02] transition-transform`}>
                                  {notif.title}
                                </p>
                                {!notif.read && (
                                  <div className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-ping ml-2 shrink-0" />
                                )}
                              </div>
                              <p className="text-sm text-slate-300 mb-2 line-clamp-2 leading-relaxed">
                                {formatNotificationBody(notif.type, notif.data)}
                              </p>
                              <p className="text-xs text-slate-500 font-mono tracking-wider">
                                {new Date(notif.timestamp).toLocaleString('en-PH', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="p-4 border-t border-slate-800/50 text-xs text-slate-500 text-center bg-gradient-to-t from-slate-900/50 to-transparent">
                    {notifications.length} total • Real-time via Supabase ✨
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1d2e]/60 border border-slate-800 rounded-xl p-1 w-fit mb-8">
        {["overview", "finance", "ministries"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-1.5 rounded-lg text-sm font-bold capitalize transition-all ${
              activeTab === tab 
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25" 
                : "text-slate-500 hover:text-slate-200 hover:bg-slate-800/50"
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
              <div key={s.label} className="group bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm hover:border-slate-600/60 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300 hover:-translate-y-1">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/30">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">{s.label}</p>
                  <s.icon className={`w-5 h-5 ${s.color} group-hover:scale-110 transition-transform`} />
                </div>
                <p className={`text-3xl lg:text-4xl font-black mb-2 ${s.color} leading-none`}>
                  {s.value}
                </p>
                <p className={`text-xs flex items-center gap-1.5 font-bold tracking-wide ${
                  s.trend === "up" 
                    ? "text-emerald-400" 
                    : s.trend === "down" 
                    ? "text-rose-400" 
                    : "text-slate-500"
                }`}>
                  {s.trend === "up" && <TrendingUp className="w-3.5 h-3.5" />}
                  {s.trend === "down" && <TrendingDown className="w-3.5 h-3.5" />}
                  {s.sub}
                </p>
              </div>
            ))}
          </div>

          {/* Next Schedule + Activity Log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Next Schedule */}
            <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm hover:border-slate-700/80 transition-all">
              <div className="flex items-center justify-between mb-6 border-b border-slate-800/50 pb-4">
                <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Next Schedule
                </h3>
                <a href="/dashboard/events" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold transition-colors">
                  View all <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5" />
                </a>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-sm text-slate-600">Syncing...</span>
                </div>
              ) : upcomingEvents.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-slate-800/50 rounded-2xl hover:border-blue-500/40 transition-colors">
                  <CalendarDays className="w-12 h-12 text-slate-700 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium text-slate-600 mb-1">No upcoming events</p>
                  <p className="text-xs text-slate-500">Events will appear here automatically</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((ev) => (
                    <div key={ev.id} className="group flex items-start justify-between gap-4 p-4 rounded-2xl bg-slate-900/30 hover:bg-slate-800/50 border border-slate-800/30 hover:border-blue-500/30 transition-all duration-200 hover:shadow-md">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate group-hover:text-blue-300 transition-colors">
                          {ev.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                          <CalendarDays className="w-3 h-3" />
                          {ev.date
                            ? new Date(ev.date + 'T00:00:00').toLocaleDateString('en-PH', { 
                                weekday: 'short', 
                                month: 'short', 
                                day: 'numeric' 
                              })
                            : 'No date set'}
                          {ev.ministry && (
                            <span className="ml-2 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded-full font-bold">
                              {ev.ministry}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold shrink-0 whitespace-nowrap ${
                        STATUS_BADGE[ev.status] || STATUS_BADGE.planning
                      }`}>
                        {ev.status?.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity Log */}
            <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm hover:border-slate-700/80 transition-all">
              <div className="mb-6 border-b border-slate-800/50 pb-4">
                <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Recent Activity
                </h3>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
                  <span className="ml-2 text-sm text-slate-600">Loading...</span>
                </div>
              ) : activityFeed.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-slate-800/50 rounded-2xl hover:border-emerald-500/40 transition-colors">
                  <TrendingUp className="w-12 h-12 text-slate-700 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium text-slate-600 mb-1">No recent activity</p>
                  <p className="text-xs text-slate-500">Activity appears here live</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activityFeed.map((a, i) => {
                    const ic = ACTIVITY_ICON[a.type];
                    return (
                      <div key={i} className="flex items-start gap-3 group hover:bg-slate-900/30 p-3 rounded-xl transition-all">
                        <span className={`mt-0.5 shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black ${ic.bg} group-hover:scale-105 transition-transform`}>
                          {ic.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 leading-tight group-hover:text-white transition-colors">
                            {a.text}
                          </p>
                          <p className="text-[10px] text-slate-600 mt-1 font-mono tracking-wider">
                            {a.time}
                          </p>
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
        <div className="space-y-8">

          {/* Balance summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { label: "Total Balance",  value: totalFunds,   icon: HandCoins,   color: "text-emerald-400 bg-emerald-500/10" },
              { label: "Total Income",   value: totalIncome,  icon: TrendingUp,  color: "text-green-400 bg-green-500/10" },
              { label: "Total Expenses", value: totalExpense, icon: TrendingDown, color: "text-rose-400 bg-rose-500/10" },
            ].map((s, i) => (
              <div key={s.label} className={`group bg-gradient-to-br ${s.color} border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm hover:shadow-xl hover:shadow-emerald-500/20 transition-all duration-300 hover:-translate-y-2 relative overflow-hidden`}>
                <div className={`absolute inset-0 bg-gradient-to-br opacity-20 animate-pulse ${s.color}`} />
                <div className="relative z-10 flex items-center gap-3 mb-4">
                  <div className={`p-2.5 rounded-2xl bg-white/10 backdrop-blur-sm shadow-lg group-hover:scale-110 transition-all`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                  <p className="text-[11px] uppercase font-bold tracking-widest text-slate-400">{s.label}</p>
                </div>
                <p className={`relative z-10 text-3xl lg:text-4xl font-black font-mono leading-none text-white drop-shadow-lg`}>
                  {loading ? (
                    <span className="animate-pulse">₱0.00</span>
                  ) : (
                    `₱${(s.value || 0).toLocaleString('en-PH', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })}`
                  )}
                </p>
              </div>
            ))}
          </div>

          {/* Fund Breakdown */}
          <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-8 backdrop-blur-sm hover:border-slate-700/80 transition-all">
            <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-6 border-b border-slate-800/50 pb-4 flex items-center gap-2">
              <HandCoins className="w-4 h-4" />
              Fund Breakdown (Live)
            </h3>
            <div className="space-y-4 mb-8">
              {FUNDS.map((fund) => (
                <div key={fund} className="flex justify-between items-center p-3 rounded-xl bg-slate-900/30 hover:bg-slate-800/50 border border-slate-800/30 hover:border-blue-500/30 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${FUND_DOTS[fund]} shadow-lg group-hover:scale-125 transition-transform`} />
                    <span className="text-sm font-semibold text-slate-200">{fund}</span>
                  </div>
                  <span className="text-lg font-black font-mono text-white tracking-tight">
                    {loading ? (
                      <span className="animate-pulse w-20 h-6 bg-slate-800 rounded inline-block"></span>
                    ) : (
                      `₱${(fundTotals[fund] || 0).toLocaleString('en-PH', { 
                        minimumFractionDigits: 2 
                      })}`
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-slate-800/50">
              <p className="text-xs text-slate-500 mb-4 font-medium">Remainder allocation after Monthly Budget:</p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "General Fund", pct: "50%", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
                  { label: "Project Fund", pct: "25%", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
                  { label: "Lot Fund",     pct: "25%", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
                ].map((item) => (
                  <div key={item.label} className={`group ${item.color} border rounded-2xl p-4 text-center hover:shadow-lg hover:shadow-current/20 transition-all cursor-pointer`}>
                    <p className="text-2xl font-black mb-1">{item.pct}</p>
                    <p className="text-[10px] uppercase tracking-wider font-bold group-hover:scale-105 transition-transform">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6 border-b border-slate-800/50 pb-4">
              <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Recent Transactions
              </h3>
              <a href="/dashboard/finance" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold transition-colors">
                View all <ChevronRight className="w-3 h-3" />
              </a>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-slate-800 h-12 rounded-xl"></div>
                ))}
              </div>
            ) : recentTransactions.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-slate-800/50 rounded-2xl">
                <HandCoins className="w-12 h-12 text-slate-700 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium text-slate-600">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {recentTransactions.map((tx, i) => (
                  <div key={i} className="flex items-center justify-between py-3 px-4 rounded-xl bg-slate-900/30 hover:bg-slate-800/50 border border-slate-800/30 transition-all group">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{tx.category}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        {tx.fund || 'General'} · {tx.member || 'Church'}
                      </p>
                    </div>
                    <p className={`text-lg font-black font-mono tracking-tight ${
                      tx.type === 'income' 
                        ? 'text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl' 
                        : 'text-rose-400 bg-rose-500/10 px-3 py-1 rounded-xl'
                    }`}>
                      {tx.type === 'expense' ? '−' : '+'}₱{(Number(tx.amount) || 0).toLocaleString('en-PH', { 
                        minimumFractionDigits: 2 
                      })}
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MINISTRIES.map((m, i) => (
              <div 
                key={m.name} 
                className="group bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-7 flex flex-col hover:border-blue-500/60 hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 hover:-translate-y-2 cursor-pointer backdrop-blur-sm"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="group-hover:rotate-12 transition-transform w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border-2 border-blue-500/30 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-xl">
                    <span className="text-lg font-black text-blue-400 drop-shadow-lg">{m.initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-white leading-tight group-hover:text-blue-300 transition-colors">
                      {m.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Head: {m.head}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/30">
                  <div className="text-2xl font-black text-slate-300">{m.members}</div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold bg-slate-900/50 px-3 py-1.5 rounded-xl group-hover:bg-blue-500/20 group-hover:text-blue-300 transition-all">
                    Members
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="bg-[#1a1d2e]/30 border-2 border-dashed border-slate-800/50 rounded-3xl p-12 text-center hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group backdrop-blur-sm">
            <BookOpen className="w-16 h-16 text-slate-700 mx-auto mb-4 group-hover:text-blue-500 group-hover:scale-110 transition-all duration-300" />
            <h3 className="text-lg font-black text-slate-300 mb-2">Ministry Management</h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Training records, attendance tracking, and discipleship progress coming soon. 
              Notifications will alert you when members join ministries.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}