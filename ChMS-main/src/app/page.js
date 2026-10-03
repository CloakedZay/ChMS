"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, CalendarDays, BarChart3, ShieldCheck, ArrowRight,
  BookOpen, Church, HandCoins, ChevronDown, MapPin, Heart,
  Sun, Moon
} from "lucide-react";

const FEATURES = [
  {
    id: "members", Icon: Users, title: "Member Directory",
    desc: "A living record of every soul in our congregation — profiles, attendance history, birthdays, and milestones, all in one place so no one is forgotten.",
    bullets: ["Complete member profiles", "Attendance per service", "Inactive member follow-up", "Birthday & anniversary records"],
  },
  {
    id: "events", Icon: CalendarDays, title: "Events & Services",
    desc: "From Sunday worship to outreach programs and Bible studies — plan, track, and record every gathering across all our ministries.",
    bullets: ["Annual calendar", "Ministry project proposals", "Budget approval workflow", "Per-event attendance logs"],
  },
  {
    id: "finance", Icon: HandCoins, title: "Tithes & Finance",
    desc: "Transparent, auditable records for every tithe, offering, and fund allocation — replacing manual bookkeeping with clarity and accountability.",
    bullets: ["Monthly budget tracking", "General, Project & Lot Funds", "Love gift recording", "Financial summaries"],
  },
  {
    id: "ministry", Icon: Church, title: "Ministry Operations",
    desc: "Coordinate all five active ministries under GGCF-GMI Pandi — assign members, manage departments, and track volunteer participation.",
    bullets: ["5 ministry departments", "Ministry head assignment", "Member-to-ministry mapping", "Activity scheduling"],
  },
  {
    id: "training", Icon: BookOpen, title: "Discipleship & Training",
    desc: "Track spiritual growth, discipleship milestones, and evangelism training managed through the Training & Life Ministry.",
    bullets: ["Discipleship progress", "Evangelism records", "Spiritual milestone logs", "Life group monitoring"],
  },
  {
    id: "reports", Icon: BarChart3, title: "Reports & Insights",
    desc: "Attendance trends, financial summaries, and ministry activity insights to support prayerful, data-informed decisions for church leadership.",
    bullets: ["Attendance trend reports", "Fund balance summaries", "Ministry activity logs", "Exportable records"],
  },
];

const STATS = [
  { value: "100+", label: "Members" },
  { value: "5",    label: "Ministries" },
  { value: "3",    label: "Locations" },
  { value: "4",    label: "Fund Categories" },
];

const LOCATIONS = [
  { name: "Pandi, Bulacan",   role: "Main Church", members: "100+ members", primary: true  },
  { name: "Marungko, Angat",  role: "Satellite",   members: "30+ members",  primary: false },
  { name: "Meycauayan",       role: "Satellite",   members: "20+ members",  primary: false },
];

// ── Theme hook (shared with login + dashboard via localStorage) ───────────────
function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("faithsync-theme");
    if (stored) setDark(stored === "dark");
  }, []);
  function toggle() {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem("faithsync-theme", next ? "dark" : "light");
      return next;
    });
  }
  return { dark, toggle };
}

export default function HomePage() {
  const [activeFeature, setActiveFeature] = useState("members");
  const { dark, toggle: toggleTheme } = useTheme();
  const active = FEATURES.find((f) => f.id === activeFeature);

  // ── Theme tokens ────────────────────────────────────────────────────────────
  const pageBg      = dark ? "bg-[#0c0e17]"        : "bg-slate-50";
  const navBg       = dark ? "bg-[#0c0e17]/90"     : "bg-white/90";
  const navBorder   = dark ? "border-white/5"       : "border-slate-200";
  const textMain    = dark ? "text-white"           : "text-slate-900";
  const textSub     = dark ? "text-slate-400"       : "text-slate-500";
  const textMuted   = dark ? "text-slate-500"       : "text-slate-400";
  const statsBg     = dark ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-200";
  const cardBase    = dark ? "bg-white/[0.03] border-white/5" : "bg-white border-slate-200";
  const featureCard = dark ? "bg-white/[0.03] border-white/5" : "bg-slate-100 border-slate-200";
  const sectionBg   = dark ? "bg-white/[0.015] border-white/5" : "bg-white border-slate-200";
  const iconBtnCls  = dark
    ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white"
    : "bg-white border-slate-200 text-slate-500 hover:text-slate-900";
  const navLinkCls  = dark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800";
  const memberBtnCls = dark
    ? "text-slate-300 hover:text-white border border-white/10 hover:border-white/20"
    : "text-slate-600 hover:text-slate-900 border border-slate-300 hover:border-slate-400";
  const heroBg2     = dark ? "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/15" : "bg-slate-100 hover:bg-slate-200 border border-slate-300";
  const locCard     = dark ? "bg-white/[0.03] border-white/5" : "bg-slate-100 border-slate-200";
  const memberRoleCard = dark ? "bg-white/[0.03] border-white/5" : "bg-slate-100 border-slate-200";
  const footerBorder = dark ? "border-white/5" : "border-slate-200";
  const footerText   = dark ? "text-slate-600" : "text-slate-400";
  const footerMuted  = dark ? "text-slate-700" : "text-slate-400";
  const featureBtnActive   = "bg-blue-600/10 border-blue-500/40 text-white";
  const featureBtnInactive = dark
    ? "bg-white/[0.03] border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10"
    : "bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300";

  return (
    <div className={`min-h-screen ${pageBg} ${textMain} font-sans selection:bg-blue-600/30 transition-colors duration-200`}>

      {/* Nav */}
      <nav className={`border-b ${navBorder} ${navBg} backdrop-blur-md sticky top-0 z-50 transition-colors duration-200`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <span className={`text-base font-black tracking-tight ${textMain} uppercase italic`}>FaithSync</span>
              <span className={`hidden sm:inline text-xs ${textMuted} ml-2 font-normal not-italic normal-case`}>GGCF-GMI Pandi</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a href="#modules"   className={`text-sm ${navLinkCls} transition-colors hidden sm:block`}>Modules</a>
            <a href="#locations" className={`text-sm ${navLinkCls} transition-colors hidden sm:block`}>Locations</a>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-full border ${iconBtnCls} transition-colors`}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Single Sign In button */}
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
      <header className="pt-24 pb-20 md:pt-32 md:pb-28 relative overflow-hidden">
        {dark && (
          <>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-80 bg-blue-600/8 blur-[140px] pointer-events-none" />
            <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[400px] h-40 bg-indigo-600/4 blur-[100px] pointer-events-none" />
          </>
        )}

        <div className="max-w-4xl mx-auto px-6 flex flex-col items-center text-center relative">
          <div className="inline-flex items-center gap-2 border border-blue-500/30 bg-blue-500/5 px-4 py-2 mb-10 rounded-full">
            <Church className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">
              God's Grace Christian Fellowship · Global Ministry Inc.
            </span>
          </div>

          <h1 className={`text-5xl lg:text-6xl font-black tracking-tight ${textMain} mb-6 leading-[1.08]`}>
            Our Church,{" "}
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              One Platform.
            </span>
          </h1>

          <p className={`max-w-xl text-base ${textSub} mb-3 leading-relaxed`}>
            FaithSync is the official management system of{" "}
            <span className={`${textMain} font-semibold`}>GGCF-GMI Pandi</span> — bringing together our members, ministries, events, and finances into a single, trusted home.
          </p>
          <p className={`max-w-md text-sm ${textMuted} mb-10 leading-relaxed`}>
            From Pandi to Angat to Meycauayan — every member, every gathering, every tithe, accounted for.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-center">
            {/* Single CTA — role detected after login */}
            <Link
              href="/login"
              className="group flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3.5 rounded-xl transition-all active:scale-95"
            >
              Sign In to FaithSync
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button
              onClick={() => document.querySelector("#modules")?.scrollIntoView({ behavior: "smooth" })}
              className={`flex items-center gap-2 text-sm ${textMuted} hover:${dark ? "text-slate-300" : "text-slate-600"} transition-colors px-4 py-3.5`}
            >
              Explore modules <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <section className={`border-y ${statsBg} py-10 transition-colors duration-200`}>
        <div className="max-w-3xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-black text-blue-400">{s.value}</p>
              <p className={`text-xs ${textMuted} mt-1 uppercase tracking-wider`}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tagline */}
      <section className="py-16 max-w-4xl mx-auto px-6 text-center">
        <p className={`${textSub} text-lg leading-relaxed max-w-2xl mx-auto`}>
          <span className={`${textMain} font-semibold`}>Serving the congregation since its founding</span> — GGCF-GMI Pandi needed a system that matched the scale and heart of its ministry. FaithSync is that system.
        </p>
        <div className={`mt-8 flex items-center justify-center gap-2 ${textMuted} text-xs uppercase tracking-widest`}>
          <Heart className="w-3 h-3 text-blue-500/60" />
          <span>Built with and for the GGCF-GMI Pandi congregation</span>
          <Heart className="w-3 h-3 text-blue-500/60" />
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="max-w-7xl mx-auto px-6 pb-24">
        <div className="text-center mb-12">
          <p className="text-xs text-blue-400/80 uppercase tracking-widest font-bold mb-3">Church Modules</p>
          <h2 className={`text-3xl font-black ${textMain} tracking-tight mb-3`}>Everything We Need, In One Place</h2>
          <p className={`${textMuted} text-sm max-w-md mx-auto`}>Six modules covering every aspect of church life — select one to learn more.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 flex flex-col gap-2">
            {FEATURES.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFeature(f.id)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${
                  activeFeature === f.id ? featureBtnActive : featureBtnInactive
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  activeFeature === f.id ? "bg-blue-600" : dark ? "bg-white/5" : "bg-slate-200"
                }`}>
                  <f.Icon className={`w-4 h-4 ${activeFeature === f.id ? "text-blue-100" : dark ? "text-slate-600" : "text-slate-500"}`} />
                </div>
                <span className="text-sm font-semibold leading-tight">{f.title}</span>
              </button>
            ))}
          </div>

          <div className={`lg:col-span-3 ${featureCard} border rounded-2xl p-8 min-h-[300px] transition-colors duration-200`}>
            {active && (
              <>
                <div className="w-11 h-11 bg-blue-600/10 border border-blue-500/20 rounded-xl flex items-center justify-center mb-5">
                  <active.Icon className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className={`text-xl font-black ${textMain} mb-3`}>{active.title}</h3>
                <p className={`${textSub} text-sm leading-relaxed mb-6`}>{active.desc}</p>
                <ul className="space-y-2.5">
                  {active.bullets.map((b) => (
                    <li key={b} className={`flex items-center gap-2.5 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Locations */}
      <section id="locations" className={`border-t ${sectionBg} py-20 transition-colors duration-200`}>
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs text-blue-400/80 uppercase tracking-widest font-bold mb-3">Our Reach</p>
            <h2 className={`text-3xl font-black ${textMain} tracking-tight mb-3`}>Three Locations, One Church</h2>
            <p className={`${textMuted} text-sm max-w-md mx-auto`}>
              GGCF-GMI Pandi spans across Bulacan — FaithSync keeps all three satellites connected under one roof.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {LOCATIONS.map((loc) => (
              <div
                key={loc.name}
                className={`rounded-2xl p-6 border transition-all ${
                  loc.primary ? "bg-blue-600/10 border-blue-500/40" : locCard
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${loc.primary ? "text-blue-400" : textMuted}`} />
                  <div>
                    <p className={`text-sm font-bold ${loc.primary ? "text-blue-300" : dark ? "text-slate-300" : "text-slate-700"}`}>{loc.name}</p>
                    <p className={`text-xs ${textMuted} mt-0.5`}>{loc.role}</p>
                  </div>
                </div>
                <p className={`text-2xl font-black ${loc.primary ? "text-white" : textSub}`}>{loc.members}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who logs in — simplified to single Sign In */}
      <section className="py-20 max-w-4xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-xs text-blue-400/80 uppercase tracking-widest font-bold mb-3">Access</p>
          <h2 className={`text-3xl font-black ${textMain} tracking-tight`}>Your Role, Your View</h2>
          <p className={`${textMuted} text-sm mt-3`}>One login — your dashboard is set by your role.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-7">
            <div className="w-10 h-10 bg-blue-600/15 border border-blue-500/25 rounded-xl flex items-center justify-center mb-5">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className={`text-lg font-black ${textMain} mb-2`}>Staff & Leadership</h3>
            <p className={`text-sm ${textSub} leading-relaxed mb-6`}>
              Pastors, ministry heads, and administrators — manage the full scope of church operations, finances, and member records.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg transition-colors"
            >
              Sign In <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className={`${memberRoleCard} border rounded-2xl p-7 transition-colors duration-200`}>
            <div className={`w-10 h-10 ${dark ? "bg-white/5 border-white/10" : "bg-slate-200 border-slate-300"} border rounded-xl flex items-center justify-center mb-5`}>
              <Users className={`w-5 h-5 ${dark ? "text-slate-400" : "text-slate-500"}`} />
            </div>
            <h3 className={`text-lg font-black ${textMain} mb-2`}>Church Members</h3>
            <p className={`text-sm ${textSub} leading-relaxed mb-6`}>
              View your profile, check upcoming events, track your attendance, and stay connected with your ministry.
            </p>
            <Link
              href="/login"
              className={`inline-flex items-center gap-2 text-sm font-bold ${textMain} ${dark ? "bg-white/8 hover:bg-white/12 border border-white/10" : "bg-slate-200 hover:bg-slate-300 border border-slate-300"} px-5 py-2.5 rounded-lg transition-colors`}
            >
              Sign In <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`border-t ${footerBorder} py-10 text-center transition-colors duration-200`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-md bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className={`text-sm font-black ${textMain} uppercase italic tracking-tight`}>FaithSync</span>
        </div>
        <p className={`${footerText} text-xs`}>God's Grace Christian Fellowship Global Ministry Inc. · Pandi, Bulacan</p>
        <p className={`${footerMuted} text-xs mt-1`}>Church Management System · Capstone Project</p>
      </footer>
    </div>
  );
}