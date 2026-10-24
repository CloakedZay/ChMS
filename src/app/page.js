"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from '@/app/context/ThemeContext';
import { supabase } from '@/app/lib/supabase';
import {
  Users, CalendarDays, BarChart3, ArrowRight, BookOpen, Church,
  HandCoins, MapPin, Heart, Sun, Moon, Check, Menu, X, ShieldCheck,
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
    bullets: ["Annual calendar", "Weekly services", "Leader approval workflow", "Per-event attendance logs"],
  },
  {
    id: "finance", Icon: HandCoins, title: "Tithes & Finance",
    desc: "Transparent, auditable records for every tithe, offering, and fund allocation — replacing manual bookkeeping with clarity and accountability.",
    bullets: ["Monthly budget tracking", "General, Project & Lot Funds", "Love gift recording", "Financial summaries"],
  },
  {
    id: "ministry", Icon: Church, title: "Ministry Operations",
    desc: "Coordinate all five active ministries under GGCF-GMI — assign members, manage departments, and track volunteer participation.",
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

// Branches come from the database (public_locations, db/079), so a new one
// shows up here by itself. These are shown until they load, and if they can't.
const LOCATIONS = [
  { name: "Pandi, Bulacan",   role: "Main Church", members: "100+ members", primary: true  },
  { name: "Marungko, Angat",  role: "Satellite",   members: "30+ members",  primary: false },
  { name: "Meycauayan",       role: "Satellite",   members: "20+ members",  primary: false },
];

// One database row → one location card. Member counts arrive rounded down to
// the nearest 10.
function toLocation(row) {
  return {
    name:    row.location || row.name,
    role:    row.is_main ? "Main Church" : "Satellite",
    members: row.members >= 10 ? `${row.members}+ members` : "Newly planted",
    primary: row.is_main,
    count:   row.members,
  };
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

// Hero photos, shown in turn (public/images, 1600×1200).
const HERO_PHOTOS = [
  { src: "/images/mens-fellowship.jpg",      alt: "The men of GGCF-GMI together at a fellowship gathering, each pointing one finger up" },
  { src: "/images/women-of-grace-walk.jpg",  alt: "Women of Grace Fellowship at their \"Walking in Faith\" walk outside the Philippine Arena" },
];
const HERO_EVERY_MS = 5000;

const NAV = [
  { href: "#about",     label: "About" },
  { href: "#modules",   label: "Modules" },
  { href: "#locations", label: "Locations" },
];

export default function HomePage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [branches, setBranches] = useState(null);   // null until loaded

  useEffect(() => {
    let live = true;
    supabase.rpc("public_locations").then(({ data, error }) => {
      if (live && !error && data?.length) setBranches(data.map(toLocation));
    });
    return () => { live = false; };
  }, []);

  const locations = branches || LOCATIONS;
  const memberTotal = branches
    ? `${Math.floor(branches.reduce((n, b) => n + b.count, 0) / 10) * 10}+`
    : "100+";
  const locationWord = NUMBER_WORDS[locations.length] || String(locations.length);
  const locationsLabel = `${locations.length} location${locations.length === 1 ? "" : "s"}`;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Next hero photo every 5 seconds, with a fade and slow zoom
  // (.hero-slide in globals.css). Restarts the wait after a dot is pressed.
  useEffect(() => {
    const id = setTimeout(() => setPhoto(i => (i + 1) % HERO_PHOTOS.length), HERO_EVERY_MS);
    return () => clearTimeout(id);
  }, [photo]);

  // ── Theme tokens: ivory / white sections (light), deep green sections (dark)
  const t = dark
    ? {
        page:     "bg-[#111815] text-slate-100",
        sectionA: "bg-[#111815]",
        sectionB: "bg-[#0e1411]",
        nav:      scrolled ? "bg-[#111815]/90 border-white/10 backdrop-blur" : "bg-transparent border-transparent",
        heading:  "text-white",
        body:     "text-slate-400",
        muted:    "text-slate-500",
        card:     "bg-[#1b2420] border-white/10 hover:border-[#c5a66a]/40",
        iconWrap: "bg-[#c5a66a]/10 text-[#c5a66a]",
        ghostBtn: "border-white/15 text-slate-200 hover:bg-white/5",
        link:     "text-slate-400 hover:text-white",
        eyebrow:  "text-[#c5a66a]",
        divider:  "border-white/10",
        iconBtn:  "border-white/15 text-slate-300 hover:bg-white/5",
        stat:     "text-white",
        check:    "text-[#c5a66a]",
      }
    : {
        page:     "bg-[#f8f7f2] text-[#252a28]",
        sectionA: "bg-[#f8f7f2]",
        sectionB: "bg-white",
        nav:      scrolled ? "bg-[#f8f7f2]/90 border-[#e5e3d8] backdrop-blur" : "bg-transparent border-transparent",
        heading:  "text-[#173f35]",
        body:     "text-[#4c534f]",
        muted:    "text-[#858b87]",
        card:     "bg-white border-[#e5e3d8] hover:border-[#c5a66a]/60",
        iconWrap: "bg-[#e8f0ea] text-[#173f35]",
        ghostBtn: "border-[#d9d6c8] text-[#173f35] hover:bg-white",
        link:     "text-[#4c534f] hover:text-[#173f35]",
        eyebrow:  "text-[#9c7f45]",
        divider:  "border-[#e5e3d8]",
        iconBtn:  "border-[#d9d6c8] text-[#4c534f] hover:bg-white",
        stat:     "text-[#173f35]",
        check:    "text-[#173f35]",
      };

  const eyebrow = (text) => (
    <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${t.eyebrow} mb-3`}>{text}</p>
  );

  return (
    <div className={`min-h-screen overflow-x-hidden ${t.page} font-sans transition-colors duration-300`}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${t.nav}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="God's Grace Christian Fellowship Global Ministries Inc. logo" className="w-10 h-10 rounded-full" />
            <span className="leading-tight">
              <span className={`block text-[15px] font-bold tracking-tight ${t.heading}`}>FaithSync</span>
              <span className={`hidden sm:block text-[11px] ${t.muted}`}>GGCF-GMI</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {NAV.map(n => (
              <a key={n.href} href={n.href} className={`text-sm font-medium ${t.link}`}>{n.label}</a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              className={`w-9 h-9 rounded-full border flex items-center justify-center ${t.iconBtn}`}
            >
              {dark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
            </button>
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center gap-1.5 bg-[#173f35] hover:bg-[#1f5144] text-white text-sm font-semibold px-5 h-9 rounded-full shadow-sm"
            >
              Log in
            </Link>
            <button
              onClick={() => setMenuOpen(v => !v)}
              aria-label="Toggle menu"
              className={`md:hidden w-9 h-9 rounded-full border flex items-center justify-center ${t.iconBtn}`}
            >
              {menuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className={`md:hidden border-t ${t.divider} ${dark ? "bg-[#111815]" : "bg-[#f8f7f2]"} px-5 py-4 space-y-1`}>
            {NAV.map(n => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}
                 className={`block py-2.5 text-sm font-medium ${t.link}`}>{n.label}</a>
            ))}
            <Link href="/login" className="block mt-2 text-center bg-[#173f35] text-white text-sm font-semibold py-2.5 rounded-full">
              Log in
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero: editorial split ──────────────────────────────────────────── */}
      <header className={`${t.sectionA} pt-28 sm:pt-32 pb-16 sm:pb-24 overflow-hidden`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.1fr_0.9fr] gap-14 lg:gap-12 items-center">

          <div className="rise">
            <span className={`inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-1.5 rounded-full border ${dark ? "border-[#c5a66a]/30 text-[#c5a66a] bg-[#c5a66a]/5" : "border-[#c5a66a]/50 text-[#7a6234] bg-[#c5a66a]/10"}`}>
              <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} /> GGCF-GMI · Bulacan, Philippines
            </span>

            <h1 className={`mt-6 text-4xl sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.08] tracking-tight ${t.heading}`}>
              One home for your<br />
              <span className={dark ? "text-[#c5a66a]" : "text-[#9c7f45]"}>church family</span>,<br />
              ministries &amp; serving.
            </h1>

            <p className={`mt-6 max-w-xl text-lg leading-relaxed ${t.body}`}>
              FaithSync brings members, events, finances and discipleship into one trusted system,
              so your leaders can spend less time on records and more time shepherding people.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link
                href="/login"
                className="group inline-flex items-center justify-center gap-2 bg-[#173f35] hover:bg-[#1f5144] text-white font-semibold px-7 h-12 rounded-full shadow-lg shadow-[#173f35]/20"
              >
                Sign in to FaithSync
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2} />
              </Link>
              <a
                href="#modules"
                className={`inline-flex items-center justify-center gap-2 border font-semibold px-7 h-12 rounded-full ${t.ghostBtn}`}
              >
                Explore modules
              </a>
            </div>

            <ul className={`mt-10 flex flex-wrap gap-x-7 gap-y-2 text-sm ${t.body}`}>
              {["Role-based access", "Per-branch records", "Transparent finances"].map(x => (
                <li key={x} className="flex items-center gap-2">
                  <Check className={`w-4 h-4 ${t.check}`} strokeWidth={2.25} /> {x}
                </li>
              ))}
            </ul>
          </div>

          {/* Image composition */}
          <div className="rise-2 relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="absolute -top-5 -right-5 w-full h-full rounded-t-[8rem] rounded-b-[2rem] border-2 border-[#c5a66a]/50" aria-hidden="true" />
            <div className={`relative aspect-[4/3] overflow-hidden rounded-t-[8rem] rounded-b-[2rem] ${dark ? "bg-[#1b2420]" : "bg-[#e8f0ea]"} shadow-xl`}>
              {!imgFailed ? (
                HERO_PHOTOS.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.src}
                    src={p.src}
                    alt={p.alt}
                    aria-hidden={i !== photo}
                    className={`hero-slide absolute inset-0 w-full h-full object-cover ${i === photo ? "is-active" : ""}`}
                    onError={() => setImgFailed(true)}
                  />
                ))
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Church className="w-24 h-24 text-[#173f35]/30" strokeWidth={1} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#173f35]/35 via-transparent to-transparent" />

              {/* Photo dots */}
              {!imgFailed && (
                <div className="absolute bottom-4 right-5 flex gap-2">
                  {HERO_PHOTOS.map((p, i) => (
                    <button
                      key={p.src}
                      type="button"
                      onClick={() => setPhoto(i)}
                      aria-label={`Show photo ${i + 1} of ${HERO_PHOTOS.length}`}
                      aria-current={i === photo}
                      className={`h-2 rounded-full transition-all ${i === photo ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white/90"}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Floating stat card */}
            <div className={`absolute -bottom-6 -left-4 sm:-left-8 ${dark ? "bg-[#1b2420] border-white/10" : "bg-white border-[#e5e3d8]"} border rounded-2xl shadow-lg px-5 py-4 flex items-center gap-4`}>
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${t.iconWrap}`}>
                <Users className="w-5 h-5" strokeWidth={1.75} />
              </span>
              <div>
                <p className={`text-xl font-bold leading-none ${t.heading}`}>{memberTotal}</p>
                <p className={`text-xs mt-1 ${t.muted}`}>Members across {locationsLabel}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── About ─────────────────────────────────────────────────────────── */}
      <section id="about" className={`${t.sectionA} pt-12 sm:pt-16 pb-20 sm:pb-28 scroll-mt-16`}>
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          {eyebrow("Our story")}
          <h2 className={`text-3xl sm:text-4xl font-bold leading-tight ${t.heading}`}>
            Built for the heart of this ministry
          </h2>
          <p className={`mt-6 text-lg leading-relaxed ${t.body}`}>
            GGCF-GMI formed out of three churches that is located in Pandi, Angat, and Meycauayan. The leaders of
            said churches decided to build one association with the same belief and doctrine about God. From the
            leaders of each church and to their members, FaithSync is a system that shall assist the association
            with their day-to-day record keeping, member training and growth tracking, organizing of events and
            services, and for the reports and analytics of their churches.
          </p>
          <div className={`mt-8 inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] ${t.muted}`}>
            <Heart className="w-3.5 h-3.5 text-[#c5a66a]" strokeWidth={1.75} />
            Built with and for the GGCF-GMI congregation
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="modules" className={`${t.sectionB} py-20 sm:py-28 scroll-mt-16`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mb-14">
            {eyebrow("What's inside")}
            <h2 className={`text-3xl sm:text-4xl font-bold leading-tight ${t.heading}`}>
              Everything the church needs, in one place
            </h2>
            <p className={`mt-4 text-lg ${t.body}`}>
              Six connected modules that replace scattered notebooks and spreadsheets.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ id, Icon, title, desc, bullets }) => (
              <article
                key={id}
                className={`group border rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${t.card}`}
              >
                <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${t.iconWrap}`}>
                  <Icon className="w-6 h-6" strokeWidth={1.75} />
                </span>
                <h3 className={`mt-6 text-lg font-bold ${t.heading}`}>{title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${t.body}`}>{desc}</p>
                <ul className="mt-5 space-y-2">
                  {bullets.slice(0, 3).map(b => (
                    <li key={b} className={`flex items-center gap-2 text-sm ${t.body}`}>
                      <Check className={`w-4 h-4 shrink-0 ${t.check}`} strokeWidth={2.25} /> {b}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Locations ─────────────────────────────────────────────────────── */}
      <section id="locations" className={`${t.sectionA} py-20 sm:py-28 scroll-mt-16`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mb-14">
            {eyebrow("Where we gather")}
            <h2 className={`text-3xl sm:text-4xl font-bold leading-tight ${t.heading}`}>
              One church, {locationWord} location{locations.length === 1 ? "" : "s"}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {locations.map(loc => (
              <div
                key={loc.name}
                className={`rounded-3xl border p-7 ${
                  loc.primary
                    ? "bg-[#173f35] border-[#173f35] text-white shadow-lg"
                    : dark ? "bg-[#1b2420] border-white/10" : "bg-white border-[#e5e3d8]"
                }`}
              >
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${loc.primary ? "bg-white/10 text-[#c5a66a]" : t.iconWrap}`}>
                  <MapPin className="w-5 h-5" strokeWidth={1.75} />
                </span>
                <h3 className={`mt-5 text-lg font-bold ${loc.primary ? "text-white" : t.heading}`}>{loc.name}</h3>
                <p className={`text-sm mt-1 ${loc.primary ? "text-white/70" : t.muted}`}>{loc.role}</p>
                <p className={`mt-5 pt-5 border-t text-sm font-semibold ${loc.primary ? "border-white/15 text-[#c5a66a]" : `${t.divider} ${t.heading}`}`}>
                  {loc.members}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Call to action ────────────────────────────────────────────────── */}
      <section className="bg-[#173f35] relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full border border-[#c5a66a]/20" aria-hidden="true" />
        <div className="absolute -right-10 -top-10 w-52 h-52 rounded-full border border-[#c5a66a]/20" aria-hidden="true" />
        <div className="relative max-w-3xl mx-auto px-5 sm:px-8 py-20 sm:py-24 text-center">
          <span className="block mx-auto mb-6 h-0.5 w-12 bg-[#c5a66a]" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">Ready to serve with clarity?</h2>
          <p className="mt-4 text-lg text-white/70 max-w-xl mx-auto">
            Sign in with your church account. Your access level is set by your administrator.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-2 bg-[#c5a66a] hover:bg-[#d3b87f] text-[#173f35] font-semibold px-8 h-12 rounded-full"
            >
              Sign in to FaithSync
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 border border-white/25 hover:bg-white/10 text-white font-semibold px-8 h-12 rounded-full"
            >
              <ShieldCheck className="w-4 h-4" strokeWidth={1.75} /> Member login
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className={`${t.sectionA} border-t ${t.divider}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="God's Grace Christian Fellowship Global Ministries Inc. logo" className="w-8 h-8 rounded-full" />
            <span className={`text-sm font-bold ${t.heading}`}>FaithSync</span>
          </div>
          <div className={`flex gap-6 text-sm ${t.muted}`}>
            {NAV.map(n => <a key={n.href} href={n.href} className={t.link}>{n.label}</a>)}
            <Link href="/login" className={t.link}>Log in</Link>
          </div>
          <p className={`text-xs ${t.muted}`}>© {new Date().getFullYear()} GGCF-GMI · Church Management System</p>
        </div>
      </footer>
    </div>
  );
}
