'use client';

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import { useAuth } from "@/app/context/AuthContext";
import { can, ROLE_LABELS } from "@/app/lib/permissions";
import { History, ChevronDown, ChevronRight, Loader2, Sun, Moon } from "lucide-react";

// Who changed what, and when. Entries are written only by database
// triggers (db/010); this page just reads them. Pastor sees everything;
// Admin sees everything except finance entries (the database enforces it).
// The Screen time tab reads page_visits totals (db/011).

const PAGE_SIZE = 100;

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
  added:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  changed:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  archived: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  restored: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  voided:   "bg-orange-500/10 text-orange-400 border-orange-500/20",
  deleted:  "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

// Field names as people would say them; anything else is shown as-is.
const FIELD_LABELS = {
  role: "Level", church_id: "Branch", full_name: "Name", status: "Status",
  is_active: "Active", title: "Title", description: "Description",
};

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

// ─── Theme token map — same pattern as the members page ─────────────────────
function T(dark) {
  return {
    pageBg:      dark ? "bg-[#0f111a]"        : "bg-slate-200",
    cardBg:      dark ? "bg-[#1a1d2e]/50"     : "bg-slate-100/90",
    cardBorder:  dark ? "border-slate-800/60"  : "border-slate-300",
    textPrimary: dark ? "text-white"           : "text-slate-900",
    textSub:     dark ? "text-slate-500"       : "text-slate-600",
    textMuted:   dark ? "text-slate-600"       : "text-slate-500",
    inputBg:     dark ? "bg-[#1a1d2e]"        : "bg-slate-50",
    inputBorder: dark ? "border-slate-800"     : "border-slate-400",
    inputText:   dark ? "text-slate-200"       : "text-slate-800",
    divider:     dark ? "border-slate-800/40"  : "border-slate-300",
    emptyIcon:   dark ? "text-slate-700"       : "text-slate-400",
    rowHover:    dark ? "hover:bg-blue-500/5"  : "hover:bg-blue-100/60",
    detailBg:    dark ? "bg-[#0f111a]"        : "bg-slate-50",
    iconBtn:     dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]   = useState(false);
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
      .select("*")
      .order("created_at", { ascending: false })
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
    const { data, error } = await q;
    if (error) { console.error("Error loading activity:", error.message); return []; }
    return data || [];
  }, [filterPerson, filterType, filterAction, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    fetchPage(0).then((rows) => {
      if (cancelled) return;
      setEntries(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setExpanded(null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchPage]);

  async function loadMore() {
    setLoadingMore(true);
    const rows = await fetchPage(entries.length);
    setEntries((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  // A filter change reloads the list from the top (see the effect above).
  const onFilter = (setter) => (ev) => { setLoading(true); setter(ev.target.value); };

  const churchName = (id) => churches.find((c) => c.id === id)?.name;
  const personName = (id) => {
    if (!id) return "System / SQL Editor";
    const p = people[id];
    return p ? (p.full_name || p.email) : "Unknown user";
  };

  const selectStyle = `${t.inputBg} border ${t.inputBorder} rounded-xl py-2 px-3 text-sm ${t.inputText} focus:outline-none focus:border-blue-500 transition-colors`;

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
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

      {/* Tabs */}
      <div className={`flex gap-1 ${t.cardBg} border ${t.cardBorder} rounded-xl p-1 w-fit mb-6`}>
        {[
          ...(canSeeChanges ? [{ key: "changes", label: "Changes" }] : []),
          { key: "screen",  label: "Screen time" },
        ].map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all ${
              tab === x.key ? "bg-blue-600 text-white shadow" : t.textSub
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "screen" && <ScreenTimePanel t={t} people={people} selectStyle={selectStyle} />}

      {tab === "changes" && (<>
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <select value={filterPerson} onChange={onFilter(setFilterPerson)} className={selectStyle}>
          <option value="all">Everyone</option>
          {Object.values(people).map((p) => (
            <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
          ))}
          <option value="system">System / SQL Editor</option>
        </select>
        <select value={filterType} onChange={onFilter(setFilterType)} className={selectStyle}>
          <option value="all">All types</option>
          {types.map((k) => <option key={k} value={k}>{TYPE_LABELS[k]}</option>)}
        </select>
        <select value={filterAction} onChange={onFilter(setFilterAction)} className={selectStyle}>
          <option value="all">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a} className="capitalize">{a}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={onFilter(setDateFrom)} className={selectStyle} title="From" />
        <input type="date" value={dateTo} onChange={onFilter(setDateTo)} className={selectStyle} title="To" />
      </div>

      {/* List */}
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl overflow-hidden backdrop-blur-sm`}>
        {loading ? (
          <div className={`flex items-center justify-center gap-2 py-14 ${t.textSub} text-sm`}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading activity...
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-14">
            <History className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
            <p className={`${t.textSub} text-sm`}>No activity matches these filters.</p>
          </div>
        ) : (
          <div className={`divide-y ${t.divider}`}>
            {entries.map((e) => {
              const isOpen = expanded === e.id;
              const changes = e.changes ? Object.entries(e.changes) : [];
              return (
                <div key={e.id}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : e.id)}
                    disabled={changes.length === 0}
                    className={`w-full text-left px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${t.rowHover} transition-colors disabled:cursor-default`}
                  >
                    <span className={`text-xs ${t.textSub} sm:w-40 shrink-0`}>{formatWhen(e.created_at)}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border w-fit shrink-0 ${ACTION_COLORS[e.action] || ACTION_COLORS.changed}`}>
                      {e.action}
                    </span>
                    <span className={`flex-1 min-w-0 text-sm ${t.textPrimary}`}>
                      <span className={t.textSub}>{TYPE_LABELS[e.table_name] || e.table_name}:</span>{" "}
                      <span className="font-semibold">{e.record_label || `#${e.record_id}`}</span>
                      {e.church_id && <span className={`text-xs ${t.textMuted}`}> · {churchName(e.church_id) || "Unknown branch"}</span>}
                    </span>
                    <span className={`text-xs ${t.textSub} sm:text-right shrink-0`}>
                      {personName(e.actor_id)}
                      {e.actor_role && <span className={t.textMuted}> · {ROLE_LABELS[e.actor_role] || e.actor_role}</span>}
                    </span>
                    {changes.length > 0 && (
                      <span className={`${t.textMuted} hidden sm:block`}>
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                    )}
                  </button>

                  {isOpen && (
                    <div className={`px-6 pb-4`}>
                      <div className={`${t.detailBg} border ${t.cardBorder} rounded-xl divide-y ${t.divider}`}>
                        {changes.map(([field, { from, to }]) => (
                          <div key={field} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-1 sm:gap-4 px-4 py-2.5 text-xs">
                            <span className={`font-bold ${t.textSub}`}>{FIELD_LABELS[field] || field}</span>
                            <span className={`${t.textPrimary} break-words`}>
                              <span className={t.textMuted}>{formatValue(from, churchName)}</span>
                              {"  →  "}
                              {formatValue(to, churchName)}
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
        )}
      </div>

      {hasMore && !loading && (
        <div className="flex justify-center mt-5">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Load more
          </button>
        </div>
      )}
      </>)}
    </div>
  );
}

// ─── Screen time tab ─────────────────────────────────────────────────────────

function ScreenTimePanel({ t, people, selectStyle }) {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return dayString(d);
  });
  const [dateTo, setDateTo]     = useState(() => dayString(new Date()));
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [openUser, setOpenUser] = useState(null);
  const [pages, setPages]       = useState({});

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

  async function toggleUser(userId) {
    if (openUser === userId) { setOpenUser(null); return; }
    setOpenUser(userId);
    if (pages[userId]) return;
    const { data, error } = await supabase.rpc("screen_time_by_page", { for_user: userId, ...dayRange(dateFrom, dateTo) });
    if (error) console.error("Error loading pages:", error.message);
    setPages((p) => ({ ...p, [userId]: data || [] }));
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <span className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>From</span>
        <input type="date" value={dateFrom} max={dateTo} onChange={onDate(setDateFrom)} className={selectStyle} />
        <span className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>To</span>
        <input type="date" value={dateTo} min={dateFrom} onChange={onDate(setDateTo)} className={selectStyle} />
        <span className={`text-xs ${t.textMuted} sm:ml-auto`}>Only time with the page open and visible is counted.</span>
      </div>

      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl overflow-hidden backdrop-blur-sm`}>
        {loading ? (
          <div className={`flex items-center justify-center gap-2 py-14 ${t.textSub} text-sm`}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading screen time...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-14">
            <History className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
            <p className={`${t.textSub} text-sm`}>No page visits in these dates.</p>
          </div>
        ) : (
          <div className={`divide-y ${t.divider}`}>
            {rows.map((r) => {
              const p = people[r.user_id];
              const isOpen = openUser === r.user_id;
              return (
                <div key={r.user_id}>
                  <button
                    onClick={() => toggleUser(r.user_id)}
                    className={`w-full text-left px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 ${t.rowHover} transition-colors`}
                  >
                    <span className={`flex-1 min-w-0 text-sm ${t.textPrimary}`}>
                      <span className="font-semibold">{p ? (p.full_name || p.email) : "Unknown user"}</span>
                      {p && <span className={`text-xs ${t.textMuted}`}> · {ROLE_LABELS[p.role] || p.role}</span>}
                    </span>
                    <span className={`text-xs ${t.textSub} sm:w-24`}>{r.visits} visit{Number(r.visits) === 1 ? "" : "s"}</span>
                    <span className={`text-sm font-black ${t.textPrimary} sm:w-24`}>{formatDuration(r.seconds)}</span>
                    <span className={`text-xs ${t.textSub} sm:w-48`}>Last seen {formatWhen(r.last_seen)}</span>
                    <span className={`${t.textMuted} hidden sm:block`}>
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-4">
                      <div className={`${t.detailBg} border ${t.cardBorder} rounded-xl divide-y ${t.divider}`}>
                        {!pages[r.user_id] ? (
                          <p className={`px-4 py-2.5 text-xs ${t.textSub}`}>Loading...</p>
                        ) : pages[r.user_id].map((pg) => (
                          <div key={pg.path} className="flex items-center gap-4 px-4 py-2.5 text-xs">
                            <span className={`flex-1 min-w-0 truncate ${t.textPrimary}`}>{pg.path}</span>
                            <span className={t.textSub}>{pg.visits} visit{Number(pg.visits) === 1 ? "" : "s"}</span>
                            <span className={`font-bold ${t.textPrimary} w-20 text-right`}>{formatDuration(pg.seconds)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
