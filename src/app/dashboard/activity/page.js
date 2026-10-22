'use client';

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import { useAuth } from "@/app/context/AuthContext";
import { can, ROLE_LABELS } from "@/app/lib/permissions";
import { levelBadge, levelDot } from "@/app/lib/roleColors";
import {
  History, ChevronDown, ChevronRight, Loader2, Sun, Moon, Users, Clock, MousePointerClick,
  Award, Search, Plus, Pencil, Archive, RotateCcw, Ban, Trash2,
} from "lucide-react";
import DatePicker from "@/app/components/DatePicker";
import Pagination from "@/app/components/Pagination";

import { baseTheme } from '@/app/lib/theme';
// Who changed what, and when. Entries are written only by database
// triggers (db/010); this page just reads them. Pastor sees everything;
// Admin sees everything except finance entries (the database enforces it).
// The Screen time tab reads page_visits totals (db/011).

// Changes per page, newest first; each page is asked from the database.
const PAGE_SIZE = 20;

const TYPE_LABELS = {
  members:                "Member",
  transactions:           "Finance entry",
  profiles:               "User",
  events:                 "Event",
  ministries:             "Ministry",
  discipleship_modules:   "Module",
  discipleship_questions: "Question",
  module_handouts:        "Handout",
  chatbot_documents:      "AI document",
  expense_requests:       "Spending request",
  expense_approvals:      "Spending approval",
  expense_receipts:       "Receipt",
  finance_settings:       "Approval limit",
};

// Finance records: only for levels with finance access (never Admin).
const FINANCE_TYPES = ["transactions", "expense_requests", "expense_approvals", "expense_receipts", "finance_settings"];

const ACTIONS = ["added", "changed", "archived", "restored", "voided", "deleted"];

const ACTION_COLORS = {
  added:    "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  changed:  "bg-blue-500/10 text-blue-500 border-blue-500/20",
  archived: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  restored: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  voided:   "bg-orange-500/10 text-orange-500 border-orange-500/20",
  deleted:  "bg-rose-500/10 text-rose-500 border-rose-500/20",
};

const ACTION_ICONS = {
  added: Plus, changed: Pencil, archived: Archive, restored: RotateCcw, voided: Ban, deleted: Trash2,
};

// Field names as people would say them; anything else is shown as-is.
const FIELD_LABELS = {
  role: "Level", church_id: "Branch", full_name: "Name", status: "Status",
  is_active: "Active", title: "Title", description: "Description",
};

// Page addresses as the sidebar names them, for the screen-time breakdown.
const PAGE_NAMES = {
  "/dashboard": "Dashboard",
  "/dashboard/messages": "Messages",
  "/dashboard/members": "Members",
  "/dashboard/follow-up": "Follow-up",
  "/dashboard/ministry": "Ministries",
  "/dashboard/users": "Users",
  "/dashboard/announcements": "Announcements",
  "/dashboard/events": "Events",
  "/dashboard/attendance": "Attendance",
  "/dashboard/training": "Training",
  "/dashboard/bible-verses": "Bible Verses",
  "/dashboard/chatbot": "Assistant",
  "/dashboard/journal": "Journal",
  "/dashboard/finance": "Finance",
  "/dashboard/reports": "Reports",
  "/dashboard/activity": "Activity",
  "/dashboard/profile": "My Profile",
  "/member-dashboard": "Member overview",
  "/member-dashboard/messages": "Messages (member)",
  "/member-dashboard/events": "Events (member)",
  "/member-dashboard/attendance": "Attendance (member)",
  "/member-dashboard/ministries": "Ministries (member)",
  "/member-dashboard/discipleship": "Discipleship",
  "/member-dashboard/chatbot": "Assistant (member)",
  "/member-dashboard/journal": "Journal (member)",
  "/member-dashboard/profile": "Profile (member)",
  "/change-password": "Password & sign-in",
};

function pageName(path) {
  const clean = String(path || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (PAGE_NAMES[clean]) return PAGE_NAMES[clean];
  const parent = Object.keys(PAGE_NAMES)
    .filter((p) => clean.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? PAGE_NAMES[parent] : clean;
}

function formatValue(v, churchName) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 120);
  const s = String(v);
  return churchName(s) || ROLE_LABELS[s] || (s.length > 120 ? s.slice(0, 120) + "…" : s);
}

function formatDuration(totalSeconds) {
  const s = Number(totalSeconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// Local-day date string, e.g. "2026-10-04", for the date inputs.
function dayString(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayString(d);
}

// Start of the "from" day to the start of the day after "to", so "to"
// includes the whole day.
function dayRange(from, to) {
  const end = new Date(`${to}T00:00`);
  end.setDate(end.getDate() + 1);
  return { from_ts: new Date(`${from}T00:00`).toISOString(), to_ts: end.toISOString() };
}

function formatWhen(ts) {
  return new Date(ts).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

// "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or the date.
function ago(ts) {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// "Today", "Yesterday", or "Wednesday, Oct 21, 2026" — headings in the change list.
function dayHeading(ts) {
  const day = dayString(new Date(ts));
  if (day === dayString(new Date())) return "Today";
  if (day === daysAgo(1)) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// ─── Theme token map — same pattern as the members page ─────────────────────
function T(dark) {
  return {
    ...baseTheme(dark),
    detailBg: dark ? "bg-[#111815]"        : "bg-slate-50",
    track:    dark ? "bg-slate-800"        : "bg-slate-300",
    chipOn:   "bg-blue-600 text-white border-blue-600",
  };
}

export default function ActivityPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);
  const { role } = useAuth();
  // Admin has no finance access, so finance records aren't offered as a filter.
  const types = Object.keys(TYPE_LABELS).filter((k) => !FINANCE_TYPES.includes(k) || can(role, "finance"));
  // Changes are the Admin's audit trail; the Pastor sees screen time only.
  const canSeeChanges = can(role, "changeLog");

  const [chosenTab, setTab]     = useState("changes");
  const tab = canSeeChanges ? chosenTab : "screen";
  const [entries, setEntries]   = useState([]);
  const [people, setPeople]     = useState({});
  const [churches, setChurches] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);   // changes matching the filters
  const [expanded, setExpanded] = useState(null);

  const [filterPerson, setFilterPerson] = useState("all");
  const [filterType, setFilterType]     = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");

  // People and branches, for names in the list and the person filter.
  useEffect(() => {
    async function load() {
      const [{ data: profiles }, { data: churchList }] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, role").order("full_name"),
        supabase.from("churches").select("id, name").order("name"),
      ]);
      const map = {};
      (profiles || []).forEach((p) => { map[p.id] = p; });
      setPeople(map);
      setChurches(churchList || []);
    }
    load();
  }, []);

  const fetchPage = useCallback(async (offset) => {
    let q = supabase
      .from("activity_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (filterPerson === "system") q = q.is("actor_id", null);
    else if (filterPerson !== "all") q = q.eq("actor_id", filterPerson);
    if (filterType !== "all")   q = q.eq("table_name", filterType);
    if (filterAction !== "all") q = q.eq("action", filterAction);
    // Dates are the viewer's local days; "to" includes the whole day.
    if (dateFrom) q = q.gte("created_at", new Date(`${dateFrom}T00:00`).toISOString());
    if (dateTo) {
      const end = new Date(`${dateTo}T00:00`);
      end.setDate(end.getDate() + 1);
      q = q.lt("created_at", end.toISOString());
    }
    const { data, count, error } = await q;
    if (error) { console.error("Error loading activity:", error.message); return { rows: [], count: 0 }; }
    return { rows: data || [], count: count || 0 };
  }, [filterPerson, filterType, filterAction, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    fetchPage((page - 1) * PAGE_SIZE).then(({ rows, count }) => {
      if (cancelled) return;
      setEntries(rows);
      setTotal(count);
      setExpanded(null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchPage, page]);

  // A filter change reloads the list from page 1 (see the effect above).
  const onFilter = (setter) => (ev) => { setLoading(true); setPage(1); setter(ev.target.value); };
  const setAction = (a) => { setLoading(true); setPage(1); setFilterAction(a); };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pg = {
    page, totalPages, total,
    from: total ? (page - 1) * PAGE_SIZE + 1 : 0,
    to: Math.min(page * PAGE_SIZE, total),
    setPage,
  };

  const churchName = (id) => churches.find((c) => c.id === id)?.name;
  const personName = (id) => {
    if (!id) return "System / SQL Editor";
    const p = people[id];
    return p ? (p.full_name || p.email) : "Unknown user";
  };

  const selectStyle = `${t.inputBg} border ${t.inputBorder} rounded-xl py-2 px-3 text-sm ${t.inputText} focus:outline-none focus:border-blue-500 transition-colors`;

  // Changes grouped under day headings, newest first.
  const groups = [];
  entries.forEach((e) => {
    const heading = dayHeading(e.created_at);
    if (groups.at(-1)?.heading !== heading) groups.push({ heading, items: [] });
    groups.at(-1).items.push(e);
  });

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}>All branches</p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Activity Log</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>
            {canSeeChanges
              ? "Who added, changed, archived or voided records, and when. Entries can't be edited or deleted."
              : "Who opened which pages, and for how long."}
          </p>
        </div>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0 self-start`}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Tabs — only when there is more than one */}
      {canSeeChanges && (
        <div className={`flex gap-1 ${t.cardBg} border ${t.cardBorder} rounded-xl p-1 w-fit mb-6`} role="tablist">
          {[{ key: "changes", label: "Changes", Icon: History }, { key: "screen", label: "Screen time", Icon: Clock }].map(({ key, label, Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                tab === key ? "bg-blue-600 text-white shadow" : t.textSub
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      )}

      {tab === "screen" && <ScreenTimePanel t={t} dark={dark} people={people} selectStyle={selectStyle} />}

      {tab === "changes" && (<>
      {/* Action chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {["all", ...ACTIONS].map((a) => {
          const on = filterAction === a;
          const Icon = ACTION_ICONS[a];
          return (
            <button key={a} onClick={() => setAction(a)} aria-pressed={on}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-bold capitalize transition-colors ${on ? t.chipOn : t.filterInactive}`}>
              {Icon && <Icon size={12} />} {a === "all" ? "All actions" : a}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <select value={filterPerson} onChange={onFilter(setFilterPerson)} className={selectStyle} aria-label="Person">
          <option value="all">Everyone</option>
          {Object.values(people).map((p) => (
            <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
          ))}
          <option value="system">System / SQL Editor</option>
        </select>
        <select value={filterType} onChange={onFilter(setFilterType)} className={selectStyle} aria-label="Type">
          <option value="all">All types</option>
          {types.map((k) => <option key={k} value={k}>{TYPE_LABELS[k]}</option>)}
        </select>
        <DatePicker value={dateFrom} max={dateTo || undefined} onChange={onFilter(setDateFrom)} placeholder="From" weekday={false} ariaLabel="From date" className={`${selectStyle} min-w-[9.5rem]`} />
        <DatePicker value={dateTo} min={dateFrom || undefined} onChange={onFilter(setDateTo)} placeholder="To" weekday={false} ariaLabel="To date" className={`${selectStyle} min-w-[9.5rem]`} />
      </div>

      {/* List, grouped by day */}
      {loading ? (
        <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl flex items-center justify-center gap-2 py-14 ${t.textSub} text-sm`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading activity...
        </div>
      ) : entries.length === 0 ? (
        <div className={`border border-dashed ${t.dashed} rounded-3xl text-center py-14`}>
          <History className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
          <p className={`${t.textSub} text-sm`}>No activity matches these filters.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.heading}>
              <p className={`text-[10px] uppercase tracking-widest font-bold ${t.textSub} mb-2 px-1`}>{g.heading}</p>
              <div className={`${t.cardBg} border ${t.cardBorder} rounded-2xl overflow-hidden divide-y ${t.divider}`}>
                {g.items.map((e) => {
                  const isOpen = expanded === e.id;
                  const changes = e.changes ? Object.entries(e.changes) : [];
                  const Icon = ACTION_ICONS[e.action] || Pencil;
                  const actor = e.actor_id ? people[e.actor_id] : null;
                  return (
                    <div key={e.id}>
                      <button
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                        disabled={changes.length === 0}
                        aria-expanded={changes.length ? isOpen : undefined}
                        className={`w-full text-left px-4 sm:px-5 py-3.5 flex items-start sm:items-center gap-3 ${t.rowHover} transition-colors disabled:cursor-default`}
                      >
                        <span className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${ACTION_COLORS[e.action] || ACTION_COLORS.changed}`}>
                          <Icon size={15} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm ${t.textPrimary}`}>
                            <span className="font-bold">{personName(e.actor_id)}</span>{" "}
                            <span className={t.textSub}>{e.action}</span>{" "}
                            <span className={t.textSub}>{(TYPE_LABELS[e.table_name] || e.table_name).toLowerCase()}</span>{" "}
                            <span className="font-semibold">{e.record_label || `#${e.record_id}`}</span>
                          </span>
                          <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] ${t.textMuted}`}>
                            {e.actor_role && (
                              <span className={`px-2 py-px rounded-full border text-[10px] font-semibold ${levelBadge(actor?.role || e.actor_role, dark)}`}>
                                {ROLE_LABELS[e.actor_role] || e.actor_role}
                              </span>
                            )}
                            {e.church_id && <span>{churchName(e.church_id) || "Unknown branch"}</span>}
                            {changes.length > 0 && <span>{changes.length} field{changes.length === 1 ? "" : "s"}</span>}
                          </span>
                        </span>
                        <span className={`text-xs ${t.textSub} shrink-0 tabular-nums`} title={formatWhen(e.created_at)}>{formatTime(e.created_at)}</span>
                        {changes.length > 0 && (
                          <span className={`${t.textMuted} hidden sm:block`}>
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </span>
                        )}
                      </button>

                      {isOpen && (
                        <div className="px-4 sm:px-5 pb-4 sm:pl-17">
                          <div className={`${t.detailBg} border ${t.cardBorder} rounded-xl divide-y ${t.divider}`}>
                            {changes.map(([field, { from, to }]) => (
                              <div key={field} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-1 sm:gap-4 px-4 py-2.5 text-xs">
                                <span className={`font-bold ${t.textSub}`}>{FIELD_LABELS[field] || field}</span>
                                <span className={`${t.textPrimary} break-words`}>
                                  <span className={`${t.textMuted} line-through decoration-1`}>{formatValue(from, churchName)}</span>
                                  {"  →  "}
                                  <span className="font-semibold">{formatValue(to, churchName)}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {!loading && <Pagination {...pg} label="changes" />}
      </>)}
    </div>
  );
}

// ─── Screen time tab ─────────────────────────────────────────────────────────

const RANGES = [
  { key: "today", label: "Today",   from: () => daysAgo(0) },
  { key: "7",     label: "7 days",  from: () => daysAgo(6) },
  { key: "30",    label: "30 days", from: () => daysAgo(29) },
  { key: "90",    label: "90 days", from: () => daysAgo(89) },
];

function ScreenTimePanel({ t, dark, people, selectStyle }) {
  const [dateFrom, setDateFrom] = useState(() => daysAgo(6));
  const [dateTo, setDateTo]     = useState(() => dayString(new Date()));
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [openUser, setOpenUser] = useState(null);
  const [pages, setPages]       = useState({});
  const [search, setSearch]     = useState("");
  const [level, setLevel]       = useState("all");

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("screen_time_by_user", dayRange(dateFrom, dateTo)).then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error("Error loading screen time:", error.message);
      setRows(data || []);
      setPages({});
      setOpenUser(null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [dateFrom, dateTo]);

  const onDate = (setter) => (ev) => { if (ev.target.value) { setLoading(true); setter(ev.target.value); } };
  const today = dayString(new Date());
  const activeRange = dateTo === today ? RANGES.find((r) => r.from() === dateFrom)?.key : null;
  function pickRange(r) {
    const from = r.from();
    if (from === dateFrom && dateTo === today) return;
    setLoading(true);
    setDateFrom(from);
    setDateTo(today);
  }

  async function toggleUser(userId) {
    if (openUser === userId) { setOpenUser(null); return; }
    setOpenUser(userId);
    if (pages[userId]) return;
    const { data, error } = await supabase.rpc("screen_time_by_page", { for_user: userId, ...dayRange(dateFrom, dateTo) });
    if (error) console.error("Error loading pages:", error.message);
    setPages((p) => ({ ...p, [userId]: data || [] }));
  }

  const nameOf = (r) => { const p = people[r.user_id]; return p ? (p.full_name || p.email) : "Unknown user"; };
  const levelOf = (r) => people[r.user_id]?.role || "member";

  const totalSeconds = rows.reduce((a, r) => a + Number(r.seconds || 0), 0);
  const totalVisits = rows.reduce((a, r) => a + Number(r.visits || 0), 0);
  const top = rows.reduce((best, r) => (!best || Number(r.seconds) > Number(best.seconds) ? r : best), null);
  const maxSeconds = top ? Number(top.seconds) || 1 : 1;
  const levels = [...new Set(rows.map(levelOf))];

  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => level === "all" || levelOf(r) === level)
    .filter((r) => !q || nameOf(r).toLowerCase().includes(q));

  const stats = [
    { label: "People active", value: rows.length, Icon: Users, tone: "text-blue-500 bg-blue-500/10" },
    { label: "Total time", value: formatDuration(totalSeconds), Icon: Clock, tone: "text-emerald-500 bg-emerald-500/10" },
    { label: "Page visits", value: totalVisits.toLocaleString(), Icon: MousePointerClick, tone: "text-[#9c7f45] bg-[#c5a66a]/15" },
    { label: "Most active", value: top ? nameOf(top) : "—", sub: top ? formatDuration(top.seconds) : "", Icon: Award, tone: "text-violet-500 bg-violet-500/10" },
  ];

  return (
    <>
      {/* Range */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <div className={`flex gap-1 ${t.cardBg} border ${t.cardBorder} rounded-xl p-1 w-fit`} role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => pickRange(r)} aria-pressed={activeRange === r.key}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeRange === r.key ? "bg-blue-600 text-white shadow" : t.textSub}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <DatePicker value={dateFrom} max={dateTo} onChange={onDate(setDateFrom)} clearable={false} weekday={false} ariaLabel="From date" className={`${selectStyle} min-w-[9.5rem]`} />
          <span className={`text-xs ${t.textSub}`}>to</span>
          <DatePicker value={dateTo} min={dateFrom} onChange={onDate(setDateTo)} clearable={false} weekday={false} ariaLabel="To date" className={`${selectStyle} min-w-[9.5rem]`} />
        </div>
        <span className={`text-xs ${t.textMuted} lg:ml-auto`}>Only time with the page open and visible is counted.</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, sub, Icon, tone }) => (
          <div key={label} className={`${t.cardBg} border ${t.cardBorder} rounded-2xl p-4 min-w-0`}>
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${tone}`}><Icon size={18} strokeWidth={1.75} /></span>
            <p className={`text-xl font-black ${t.textPrimary} truncate`}>{loading ? "…" : value}</p>
            <p className={`text-xs mt-0.5 ${t.textMuted}`}>{label}{sub && !loading ? ` · ${sub}` : ""}</p>
          </div>
        ))}
      </div>

      {/* Search + level */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={15} className={`absolute left-3 top-2.5 ${t.textMuted}`} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" aria-label="Search people"
            className={`${selectStyle} w-full pl-9`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", ...levels].map((l) => (
            <button key={l} onClick={() => setLevel(l)} aria-pressed={level === l}
              className={`px-3 h-9 rounded-full border text-xs font-bold transition-colors ${level === l ? t.chipOn : t.filterInactive}`}>
              {l === "all" ? "Everyone" : ROLE_LABELS[l] || l}
            </button>
          ))}
        </div>
      </div>

      {/* People */}
      {loading ? (
        <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl flex items-center justify-center gap-2 py-14 ${t.textSub} text-sm`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading screen time...
        </div>
      ) : shown.length === 0 ? (
        <div className={`border border-dashed ${t.dashed} rounded-3xl text-center py-14`}>
          <History className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
          <p className={`${t.textSub} text-sm`}>{rows.length ? "Nobody matches your search." : "No page visits in these dates."}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((r) => {
            const name = nameOf(r);
            const lvl = levelOf(r);
            const isOpen = openUser === r.user_id;
            const rank = rows.indexOf(r) + 1;
            const share = Math.max(2, Math.round((Number(r.seconds) / maxSeconds) * 100));
            const userPages = pages[r.user_id];
            const pageMax = userPages?.length ? Math.max(...userPages.map((x) => Number(x.seconds) || 0), 1) : 1;
            return (
              <div key={r.user_id} className={`${t.cardBg} border ${isOpen ? "border-blue-500/40" : t.cardBorder} rounded-2xl overflow-hidden transition-colors`}>
                <button
                  onClick={() => toggleUser(r.user_id)}
                  aria-expanded={isOpen}
                  className={`w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-3 sm:gap-4 ${t.rowHover} transition-colors`}
                >
                  <span className={`hidden sm:block w-6 text-xs font-black tabular-nums text-center ${rank <= 3 ? "text-[#c5a66a]" : t.textMuted}`}>{rank}</span>
                  <span className={`relative w-10 h-10 rounded-full flex items-center justify-center text-xs font-black border shrink-0 ${levelBadge(lvl, dark)}`}>
                    {initials(name)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm font-bold ${t.textPrimary} truncate`}>{name}</span>
                      <span className={`hidden sm:inline px-2 py-px rounded-full border text-[10px] font-semibold shrink-0 ${levelBadge(lvl, dark)}`}>{ROLE_LABELS[lvl] || lvl}</span>
                    </span>
                    <span className="flex items-center gap-2 mt-1.5">
                      <span className={`flex-1 max-w-md h-1.5 rounded-full overflow-hidden ${t.track}`}>
                        <span className={`block h-full rounded-full ${levelDot(lvl)}`} style={{ width: `${share}%` }} />
                      </span>
                    </span>
                    <span className={`block text-[11px] mt-1 ${t.textMuted}`}>
                      {r.visits} visit{Number(r.visits) === 1 ? "" : "s"} · last seen <span title={formatWhen(r.last_seen)}>{ago(r.last_seen)}</span>
                    </span>
                  </span>
                  <span className={`text-base sm:text-lg font-black tabular-nums ${t.textPrimary} shrink-0`}>{formatDuration(r.seconds)}</span>
                  <span className={`${t.textMuted} hidden sm:block`}>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                </button>

                {isOpen && (
                  <div className={`border-t ${t.divider} px-4 sm:px-5 py-4`}>
                    <p className={`text-[10px] uppercase tracking-widest font-bold ${t.textSub} mb-3`}>Time per page</p>
                    {!userPages ? (
                      <p className={`flex items-center gap-2 text-xs ${t.textSub}`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</p>
                    ) : userPages.length === 0 ? (
                      <p className={`text-xs ${t.textSub}`}>No pages recorded.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {userPages.map((p) => (
                          <div key={p.path}>
                            <div className="flex items-center justify-between gap-3 text-xs mb-1">
                              <span className={`font-semibold ${t.textPrimary} truncate`} title={p.path}>{pageName(p.path)}</span>
                              <span className={`${t.textSub} shrink-0 tabular-nums`}>
                                {p.visits} visit{Number(p.visits) === 1 ? "" : "s"} · <span className={`font-bold ${t.textPrimary}`}>{formatDuration(p.seconds)}</span>
                              </span>
                            </div>
                            <div className={`h-1.5 rounded-full overflow-hidden ${t.track}`}>
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(2, Math.round((Number(p.seconds) / pageMax) * 100))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
