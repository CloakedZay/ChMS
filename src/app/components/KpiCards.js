"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { can } from "@/app/lib/permissions";
import { phToday } from "@/app/lib/phDate";
import { collapseSeries } from "@/app/lib/eventSeries";
import { countsInTotals } from "@/app/lib/financeTotals";
import { fetchAll } from "@/app/lib/fetchAll";
import { peso } from "@/app/lib/format";
import { Users, UserCheck, HandCoins, CalendarDays, HeartHandshake, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

// Dashboard KPI cards: each figure with how it compares to last month and a
// six-month trend line, from live data. What a level sees follows the
// database's own rules (member_join_trend db/076, attendance_events
// db/041, finance only for finance levels).
//   Members      total, new members this month vs last month
//   Attendance   90-day rate, this month's rate vs last month's
//   Giving       income this month so far vs the same days last month
//                (finance levels), with the balance
//   Events       upcoming, events held this month vs last month
//   Follow-up    members waiting (levels without finance who follow up)

const MONTHS = 6;

// The last n months, oldest first, as "YYYY-MM" (Philippine date).
function lastMonths(n) {
  const [y, m] = phToday().split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-PH", { month: "short" });

// Up is good for every figure here; equal is flat.
function compare(now, before, fmt = (n) => n) {
  if (now === null || before === null || now === undefined || before === undefined) return null;
  const diff = now - before;
  return { dir: diff > 0 ? "up" : diff < 0 ? "down" : "flat", text: fmt(diff) };
}

function Sparkline({ values, className }) {
  const pts = values.map((v) => (Number.isFinite(v) ? v : 0));
  if (pts.length < 2 || pts.every((v) => v === 0)) return <div className="h-7" aria-hidden="true" />;
  const max = Math.max(...pts);
  const min = Math.min(...pts, 0);
  const span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * 100, 26 - ((v - min) / span) * 22]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy.at(-1);
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={`w-full h-7 overflow-visible ${className}`} aria-hidden="true">
      <polyline points={`0,28 ${line} 100,28`} fill="currentColor" opacity="0.08" stroke="none" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function KpiCards({ role, dark, t, followUpCount = 0 }) {
  const showFinance = can(role, "finance");
  const showFollowUp = !showFinance && can(role, "followUp");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const months = lastMonths(MONTHS);
      const start = `${months[0]}-01`;
      const today = phToday();

      const [members, joins, att, events, upcoming, trans, funds] = await Promise.all([
        supabase.from("member_directory").select("*", { count: "exact", head: true }),
        supabase.rpc("member_join_trend", { p_months: MONTHS }),
        supabase.rpc("attendance_events", { p_church: null }),
        fetchAll(() => supabase.from("events").select("date, status").in("status", ["approved", "done"]).gte("date", start).lte("date", today).order("id")),
        supabase.from("events").select("*").eq("status", "approved").gte("date", today).order("date", { ascending: true }),
        showFinance
          ? fetchAll(() => supabase.from("transactions").select("amount, type, date_recorded, status").gte("date_recorded", start).order("id"))
          : Promise.resolve({ data: [] }),
        showFinance ? supabase.rpc("finance_summary", { p_church: null }) : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;

      // New members per month (db/076); [] before it is set up.
      const joinBy = Object.fromEntries((joins.data || []).map((r) => [String(r.month).slice(0, 7), r.joined]));
      const joined = months.map((m) => joinBy[m] ?? 0);

      // Attendance: members present ÷ members, per month and over 90 days.
      const taken = (att.data || []).filter((e) => e.members_present + e.visitors > 0);
      const rateOf = (list) => {
        const possible = list.reduce((a, e) => a + e.active_members, 0);
        return list.length && possible ? Math.round((list.reduce((a, e) => a + e.members_present, 0) / possible) * 100) : null;
      };
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const monthlyRate = months.map((m) => rateOf(taken.filter((e) => String(e.date).slice(0, 7) === m)));

      // Events held per month; upcoming counts a weekly event once (db/049).
      const held = months.map((m) => (events.data || []).filter((e) => String(e.date).slice(0, 7) === m).length);

      // Giving: income per month, and this month so far vs the same days of
      // last month, so an unfinished month isn't compared to a whole one.
      const income = (trans.data || []).filter((x) => x.type === "income" && countsInTotals(x));
      const givingBy = months.map((m) => income.filter((x) => String(x.date_recorded).slice(0, 7) === m).reduce((a, x) => a + Number(x.amount || 0), 0));
      const day = Number(today.slice(8, 10));
      const lastSameDays = income
        .filter((x) => String(x.date_recorded).slice(0, 7) === months.at(-2) && Number(String(x.date_recorded).slice(8, 10)) <= day)
        .reduce((a, x) => a + Number(x.amount || 0), 0);
      const balance = (funds.data || []).reduce((a, r) => a + (Number(r.income) || 0) - (Number(r.expense) || 0), 0);

      setData({
        months,
        totalMembers: members.count || 0,
        joined,
        rate90: rateOf(taken.filter((e) => e.date >= since)),
        monthlyRate,
        held,
        upcoming: collapseSeries(upcoming.data || []).length,
        givingBy,
        lastSameDays,
        balance,
      });
    }
    load().catch((err) => console.error("KPI cards:", err));
    return () => { cancelled = true; };
  }, [showFinance]);

  const loading = data === null;
  const m = data?.months || lastMonths(MONTHS);
  const pct = (n) => `${n > 0 ? "+" : ""}${n}%`;
  const plus = (n) => `${n > 0 ? "+" : ""}${n}`;

  const cards = [
    {
      key: "members", label: "Members", Icon: Users, href: "/dashboard/members", tone: dark ? "text-blue-400" : "text-blue-600",
      value: data?.totalMembers.toLocaleString(),
      delta: data && compare(data.joined.at(-1), data.joined.at(-2), (d) => `${plus(d)} new vs ${monthLabel(m.at(-2))}`),
      note: data ? `${data.joined.at(-1)} joined in ${monthLabel(m.at(-1))}` : "",
      spark: data?.joined,
    },
    {
      key: "attendance", label: "Attendance Rate", Icon: UserCheck, href: "/dashboard/attendance", tone: dark ? "text-indigo-400" : "text-indigo-600",
      value: data ? (data.rate90 === null ? "—" : `${data.rate90}%`) : null,
      delta: data && compare(data.monthlyRate.at(-1), data.monthlyRate.at(-2), (d) => `${pct(d)} vs ${monthLabel(m.at(-2))}`),
      note: data ? (data.rate90 === null ? "No attendance taken yet" : "Last 90 days") : "",
      spark: data?.monthlyRate,
    },
    ...(showFinance ? [{
      key: "giving", label: `Giving · ${monthLabel(m.at(-1))}`, Icon: HandCoins, href: "/dashboard/finance", tone: dark ? "text-purple-400" : "text-purple-600",
      value: data && peso(data.givingBy.at(-1)),
      delta: data && (data.lastSameDays
        ? compare(data.givingBy.at(-1), data.lastSameDays, (d) => `${pct(Math.round((d / data.lastSameDays) * 100))} vs same days last month`)
        : null),
      note: data ? `Balance ${peso(data.balance)}` : "",
      spark: data?.givingBy,
    }] : []),
    {
      key: "events", label: "Upcoming Events", Icon: CalendarDays, href: "/dashboard/events", tone: dark ? "text-pink-400" : "text-pink-600",
      value: data?.upcoming.toString(),
      delta: data && compare(data.held.at(-1), data.held.at(-2), (d) => `${plus(d)} held vs ${monthLabel(m.at(-2))}`),
      note: data ? `${data.held.at(-1)} held in ${monthLabel(m.at(-1))}` : "",
      spark: data?.held,
    },
    ...(showFollowUp ? [{
      key: "followup", label: "Need Follow-up", Icon: HeartHandshake, href: "/dashboard/follow-up", tone: followUpCount ? (dark ? "text-rose-400" : "text-rose-600") : (dark ? "text-emerald-400" : "text-emerald-600"),
      value: String(followUpCount),
      delta: null,
      note: followUpCount ? "Members to reach out to" : "Everyone is accounted for",
      spark: null,
    }] : []),
  ];

  const deltaTone = {
    up:   dark ? "text-emerald-400 bg-emerald-500/10" : "text-emerald-700 bg-emerald-500/10",
    down: dark ? "text-rose-400 bg-rose-500/10"       : "text-rose-700 bg-rose-500/10",
    flat: `${t.textSub} bg-slate-500/10`,
  };
  const DeltaIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${cards.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-5`}>
      {cards.map((c) => {
        const D = c.delta && DeltaIcon[c.delta.dir];
        return (
          <Link key={c.key} href={c.href}
            className={`${t.cardBg} border ${t.cardBorder} rounded-3xl backdrop-blur-sm p-5 flex flex-col gap-2 hover:border-slate-500 transition-colors group`}>
            <div className="flex items-center justify-between">
              <p className={`text-[10px] uppercase font-bold tracking-widest ${t.textSub}`}>{c.label}</p>
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center bg-current/10 ${c.tone}`}>
                <c.Icon className="w-4 h-4" />
              </span>
            </div>
            <p className={`text-3xl font-black tabular-nums ${c.tone} truncate`}>{loading ? "…" : c.value}</p>
            <div className="min-h-[22px]">
              {!loading && c.delta && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${deltaTone[c.delta.dir]}`}>
                  <D className="w-3 h-3" /> {c.delta.text}
                </span>
              )}
              {!loading && !c.delta && c.spark && (
                <span className={`text-[11px] ${t.textMuted}`}>No comparison yet</span>
              )}
            </div>
            {c.spark && (
              <div className={c.tone} title={`${MONTHS}-month trend: ${m.map(monthLabel).join(", ")}`}>
                {loading ? <div className="h-7" /> : <Sparkline values={c.spark} />}
              </div>
            )}
            <p className={`text-xs ${t.textMuted} truncate`}>{loading ? " " : c.note}</p>
          </Link>
        );
      })}
    </div>
  );
}
