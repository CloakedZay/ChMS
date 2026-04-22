"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Users, Bell, Search, TrendingUp, UserCheck,
  CalendarDays, HandCoins, ChevronRight,
  ArrowUpRight, BookOpen, TrendingDown
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");

  // ── Real database states (keeping yours + adding more) ────────────────────
  const [memberCount, setMemberCount]   = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);
  const [totalFunds, setTotalFunds]     = useState(0);
  const [totalIncome, setTotalIncome]   = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [fundTotals, setFundTotals]     = useState({});
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [recentMembers, setRecentMembers] = useState([]);

  // ── Fetch all live data ───────────────────────────────────────────────────

  useEffect(() => {
    async function fetchLiveStats() {
      setLoading(true);
      try {
        // 1. Member count + active count
        const { count: mCount } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true });

        const { count: aCount } = await supabase
          .from('members')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        // 2. Last 3 members added (for activity feed)
        const { data: latestMembers } = await supabase
          .from('members')
          .select('full_name, status, ministry')
          .order('id', { ascending: false })
          .limit(3);

        // 3. All transactions (for fund totals + balance)
        const { data: trans } = await supabase
          .from('transactions')
          .select('amount, type, fund, category, member, date')
          .order('date', { ascending: false });

        // 4. Upcoming events (date >= today)
        const { data: evts } = await supabase
          .from('events')
          .select('*')
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true })
          .limit(4);

        // ── Compute stats ─────────────────────────────────────────────────

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

          // Fund breakdown
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
            {loading ? "Syncing with Supabase..." : "Live data from all church modules."}
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
          <button className="relative p-2 bg-[#1a1d2e] rounded-full border border-slate-800 text-slate-400 hover:text-white transition-colors">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-[#0f111a]" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1d2e]/60 border border-slate-800 rounded-xl p-1 w-fit mb-8">
        {["overview", "finance", "ministries"].map((tab) => (
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

            {/* Next Schedule — now live from Supabase */}
            <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
                <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Next Schedule</h3>
                <a href="/dashboard/events" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                  View all <ChevronRight className="w-3 h-3" />
                </a>
              </div>
              {loading ? (
                <p className="text-slate-600 text-sm text-center py-8">Syncing...</p>
              ) : upcomingEvents.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl">
                  <CalendarDays className="w-8 h-8 text-slate-800 mx-auto mb-2" />
                  <p className="text-xs text-slate-600">No upcoming events found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((ev) => (
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

            {/* Activity Log — now live from Supabase */}
            <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
              <div className="mb-5 border-b border-slate-800 pb-3">
                <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Activity Log</h3>
              </div>
              {loading ? (
                <p className="text-slate-600 text-sm text-center py-8">Syncing...</p>
              ) : activityFeed.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-slate-800 rounded-2xl">
                  <TrendingUp className="w-8 h-8 text-slate-800 mx-auto mb-2" />
                  <p className="text-xs text-slate-600">No recent activities logged.</p>
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

          {/* Balance summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Balance",  value: totalFunds,   icon: HandCoins,   color: "text-blue-400" },
              { label: "Total Income",   value: totalIncome,  icon: TrendingUp,  color: "text-emerald-400" },
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

          {/* Fund Breakdown — live from transactions */}
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

          {/* Recent Transactions */}
          <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
              <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Recent Transactions</h3>
              <a href="/dashboard/finance" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                View all <ChevronRight className="w-3 h-3" />
              </a>
            </div>
            {loading ? (
              <p className="text-slate-600 text-sm text-center py-4">Syncing...</p>
            ) : recentTransactions.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-4">No transactions yet.</p>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((tx, i) => (
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

    </div>
  );
}