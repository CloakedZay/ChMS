"use client";

import { useState } from "react";
import {
  Users, Bell, Search, TrendingUp, UserCheck,
  CalendarDays, HandCoins, Church, ChevronRight,
  ArrowUpRight, ArrowDownRight, BookOpen, MoreHorizontal
} from "lucide-react";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const STATS = [
  { label: "Active Members", value: "152", sub: "+4 this month", icon: Users, color: "text-blue-400", trend: "up" },
  { label: "Attendance Rate", value: "78%", sub: "Last Sunday", icon: UserCheck, color: "text-indigo-400", trend: "up" },
  { label: "Total Church Funds", value: "₱164,500", sub: "All categories", icon: HandCoins, color: "text-purple-400", trend: "up" },
  { label: "Upcoming Events", value: "3", sub: "This week", icon: CalendarDays, color: "text-pink-400", trend: "neutral" },
];

const FUNDS = [
  { label: "Monthly Budget", amount: "₱18,500.00", total: 22000, current: 18500, dot: "bg-yellow-500" },
  { label: "General Fund",   amount: "₱42,800.00", total: 60000, current: 42800, dot: "bg-blue-500" },
  { label: "Project Fund",   amount: "₱31,200.00", total: 50000, current: 31200, dot: "bg-purple-500" },
  { label: "Lot Fund",       amount: "₱87,500.00", total: 200000, current: 87500, dot: "bg-pink-500" },
];

const MINISTRIES = [
  { name: "Program & Music Ministry",  head: "Mr. Israel Dadap",    members: 12, initials: "ID" },
  { name: "Mission & Evangelism",      head: "Mr. Neator Jose",     members: 9,  initials: "NJ" },
  { name: "Training & Life Ministry",  head: "Ms. Lolita Jose",     members: 8,  initials: "LJ" },
  { name: "Building & Equipment",      head: "Mr. Ariel Dela Peña", members: 6,  initials: "AD" },
  { name: "Finance Ministry",          head: "Mr. David Lopez",     members: 5,  initials: "DL" },
];

const EVENTS = [
  { title: "Sunday Worship Service",    date: "Apr 13, 2025", type: "Service",  attendees: 104, status: "Approved" },
  { title: "Youth Bible Study",         date: "Apr 16, 2025", type: "Study",    attendees: 28,  status: "Approved" },
  { title: "Outreach — Brgy. Dampol",  date: "Apr 19, 2025", type: "Outreach", attendees: 15,  status: "Pending" },
];

const ACTIVITY = [
  { type: "member",  text: "Juan dela Cruz registered as a new member",          time: "2 hours ago" },
  { type: "finance", text: "Tithe offering recorded — ₱4,200",                   time: "Yesterday" },
  { type: "event",   text: "Bible Study scheduled for Wednesday 6PM",             time: "Yesterday" },
  { type: "member",  text: "3 members absent for 3 consecutive Sundays",          time: "2 days ago" },
  { type: "finance", text: "Project Fund received ₱5,000 love gift",              time: "3 days ago" },
];

const EVENT_BADGE = {
  Service:  "bg-blue-500/15 text-blue-400",
  Study:    "bg-violet-500/15 text-violet-400",
  Outreach: "bg-emerald-500/15 text-emerald-400",
};

const STATUS_BADGE = {
  Approved: "bg-emerald-500/15 text-emerald-400",
  Pending:  "bg-yellow-500/15 text-yellow-400",
};

const ACTIVITY_ICON = {
  member:  { bg: "bg-blue-500/20 text-blue-400",    label: "M" },
  finance: { bg: "bg-emerald-500/20 text-emerald-400", label: "₱" },
  event:   { bg: "bg-violet-500/20 text-violet-400",  label: "E" },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="p-8 min-h-screen bg-[#0f111a]">

      {/* Header */}
      <div className="flex justify-between items-start mb-10">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h2 className="text-2xl font-black text-white">Dashboard Overview</h2>
          <p className="text-slate-500 text-sm mt-0.5">Welcome back. Here's what's happening today.</p>
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
              activeTab === tab
                ? "bg-blue-600 text-white shadow"
                : "text-slate-500 hover:text-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
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
                  {s.trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : null}
                  {s.sub}
                </p>
              </div>
            ))}
          </div>

          {/* Events + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Upcoming Events */}
            <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
                <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Upcoming Events</h3>
                <button className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-3">
                {EVENTS.map((ev) => (
                  <div key={ev.title} className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{ev.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{ev.date} · {ev.attendees} expected</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${EVENT_BADGE[ev.type]}`}>{ev.type}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_BADGE[ev.status]}`}>{ev.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
              <div className="mb-5 border-b border-slate-800 pb-3">
                <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Recent Activity</h3>
              </div>
              <div className="space-y-4">
                {ACTIVITY.map((a, i) => {
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
            </div>
          </div>
        </div>
      )}

      {/* ── FINANCE ── */}
      {activeTab === "finance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FUNDS.map((fund) => {
              const pct = Math.round((fund.current / fund.total) * 100);
              return (
                <div key={fund.label} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${fund.dot}`} />
                      <span className="text-sm font-bold text-white">{fund.label}</span>
                    </div>
                    <span className="text-xs text-slate-600">{pct}% of goal</span>
                  </div>
                  <p className="text-2xl font-black text-white font-mono mb-3">{fund.amount}</p>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${fund.dot} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-700 mt-2">Goal: ₱{fund.total.toLocaleString()}</p>
                </div>
              );
            })}
          </div>

          {/* Allocation Logic */}
          <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
            <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-5 border-b border-slate-800 pb-3">Fund Allocation Logic</h3>
            <p className="text-xs text-slate-400 mb-4">After Monthly Budget is set aside, the remainder is divided:</p>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: "General Fund", pct: "50%", color: "text-blue-400" },
                { label: "Project Fund", pct: "25%", color: "text-purple-400" },
                { label: "Lot Fund",     pct: "25%", color: "text-pink-400" },
              ].map((item) => (
                <div key={item.label} className="bg-slate-900/60 rounded-2xl p-4 text-center">
                  <p className={`text-2xl font-black ${item.color}`}>{item.pct}</p>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-700">
              Specific love gifts go directly to the intended fund. All transactions are recorded for accountability.
            </p>
          </div>
        </div>
      )}

      {/* ── MINISTRIES ── */}
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