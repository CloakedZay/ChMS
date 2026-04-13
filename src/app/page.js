"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users, CalendarDays, BarChart3, ShieldCheck, ArrowRight,
  BookOpen, Church, HandCoins, ChevronDown
} from "lucide-react";

const FEATURES = [
  {
    id: "members",
    Icon: Users,
    title: "Member & Attendance Management",
    desc: "Maintain a centralized member directory with birthday tracking, participation history, and inactive member monitoring — so no one in the congregation slips through the cracks.",
    bullets: ["Member profile directory", "Attendance tracking per service", "Inactive member alerts", "Birthday & anniversary records"],
  },
  {
    id: "events",
    Icon: CalendarDays,
    title: "Events & Services",
    desc: "Plan worship services, outreach programs, and Bible studies. Manage project proposals from each ministry department through a structured approval workflow.",
    bullets: ["Annual calendar planning", "Per-ministry project proposals", "Budget approval workflow", "Attendance logging per event"],
  },
  {
    id: "finance",
    Icon: HandCoins,
    title: "Finance Management",
    desc: "Track tithes, offerings, and fund allocations across all four fund categories with transparent, auditable records — no more manual bookkeeping.",
    bullets: ["Monthly Budget tracking", "General, Project & Lot Funds", "Love gift recording", "Financial reports & summaries"],
  },
  {
    id: "ministry",
    Icon: Church,
    title: "Ministry Coordination",
    desc: "Coordinate all five active ministries under GGCF-GMI Pandi, assign members to departments, and monitor volunteer participation.",
    bullets: ["5 ministry departments", "Ministry head assignment", "Member-to-ministry mapping", "Activity scheduling per ministry"],
  },
  {
    id: "training",
    Icon: BookOpen,
    title: "Training & Discipleship",
    desc: "Monitor member spiritual growth, discipleship progress, and evangelism training — managed by the Training & Life Ministry.",
    bullets: ["Discipleship progress tracking", "Evangelism training records", "Spiritual milestone logging", "Life group monitoring"],
  },
  {
    id: "reports",
    Icon: BarChart3,
    title: "Reports & Analytics",
    desc: "Generate attendance trends, financial summaries, and ministry activity insights to support data-driven decisions for church leadership.",
    bullets: ["Attendance trend reports", "Fund balance summaries", "Ministry activity logs", "Exportable records"],
  },
];

const STATS = [
  { value: "100+", label: "Members in Pandi" },
  { value: "5", label: "Active Ministries" },
  { value: "3", label: "Satellite Locations" },
  { value: "4", label: "Finance Fund Categories" },
];

export default function HomePage() {
  const [activeFeature, setActiveFeature] = useState("members");
  const active = FEATURES.find((f) => f.id === activeFeature);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600/30">

      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-white uppercase italic">FaithSync</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">Features</a>
            <a href="#about" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">About</a>
            <Link
              href="/login"
              className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="py-24 md:py-32 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-72 bg-blue-600/8 blur-[140px] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 border border-blue-500/30 bg-blue-500/5 px-4 py-1.5 mb-8 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">
              Capstone Project · GGCF-GMI Pandi
            </span>
          </div>

          <h1 className="text-5xl lg:text-6xl font-black tracking-tight text-white mb-5 leading-[1.1]">
            Church Management,{" "}
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Built for Your Ministry.
            </span>
          </h1>

          <p className="max-w-2xl text-base text-slate-400 mb-4 leading-relaxed">
            FaithSync is a web-based Church Management System developed for{" "}
            <span className="text-slate-200 font-medium">God's Grace Christian Fellowship Global Ministry Inc.</span> — Pandi, Bulacan.
          </p>
          <p className="max-w-xl text-sm text-slate-500 mb-10 leading-relaxed">
            Replacing fragmented spreadsheets and manual records with a centralized platform for member management, attendance tracking, event coordination, ministry operations, and financial transparency.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <Link
              href="/login"
              className="group flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3.5 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-95"
            >
              Sign In to FaithSync
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector("#features")?.scrollIntoView({
                  behavior: "smooth",
                });
              }}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors px-4 py-3.5"
            >
              See features <ChevronDown className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* Stats Strip */}
      <section className="border-y border-slate-800/60 bg-slate-900/30 py-8">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-black text-white">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Feature Explorer */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="text-xs text-blue-400 uppercase tracking-widest font-bold mb-3">Core Modules</p>
          <h2 className="text-3xl font-black text-white tracking-tight mb-3">Everything Your Church Needs</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Six modules built around the real administrative needs of GGCF-GMI Pandi. Click any module to learn more.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-2 flex flex-col gap-2">
            {FEATURES.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFeature(f.id)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${
                  activeFeature === f.id
                    ? "bg-blue-600/10 border-blue-500/40 text-white"
                    : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  activeFeature === f.id ? "bg-blue-600" : "bg-slate-800"
                }`}>
                  <f.Icon className={`w-4 h-4 ${activeFeature === f.id ? "text-white" : "text-slate-500"}`} />
                </div>
                <span className="text-sm font-semibold leading-tight">{f.title}</span>
              </button>
            ))}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-8 min-h-[320px]">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-5">
              <active.Icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-black text-white mb-3">{active.title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">{active.desc}</p>
            <ul className="space-y-2">
              {active.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="border-t border-slate-800/60 bg-slate-900/20 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs text-blue-400 uppercase tracking-widest font-bold mb-3">About the Project</p>
          <h2 className="text-3xl font-black text-white mb-5">Built for GGCF-GMI Pandi</h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mx-auto mb-8">
            God's Grace Christian Fellowship Global Ministry Inc. operates multiple satellites across Bulacan — with the Pandi branch serving over 100 members and five active ministry departments. FaithSync was developed as a capstone project to address the absence of a centralized management system, replacing manual processes with a secure, role-based web platform.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            {[
              { label: "Pandi, Bulacan", sub: "Main satellite · 100+ members" },
              { label: "Marungko, Angat", sub: "Satellite · 30+ members" },
              { label: "Meycauayan", sub: "Satellite · 20+ members" },
            ].map((loc) => (
              <div key={loc.label} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
                <p className="text-sm font-bold text-white">{loc.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{loc.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <div className="max-w-xl mx-auto px-6">
          <h2 className="text-3xl font-black text-white mb-4">Ready to get started?</h2>
          <p className="text-slate-400 text-sm mb-8">Sign in with your credentials to access the FaithSync dashboard.</p>
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-10 py-4 rounded-xl shadow-xl shadow-blue-900/20 transition-all active:scale-95"
          >
            Sign In to FaithSync
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-900 py-10 text-center text-slate-600 text-xs">
        FaithSync · Church Management System for GGCF-GMI Pandi · Capstone Project
      </footer>
    </div>
  );
}