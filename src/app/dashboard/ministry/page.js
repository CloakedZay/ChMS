"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import { useAuth } from "@/app/context/AuthContext";
import Link from "next/link";
import { GLOBAL_ROLES } from "@/app/lib/permissions";
import {
  ChevronRight, ChevronDown, Plus, X, Sun, Moon, Pencil, UserPlus,
  Trash2, Loader2, Users, CalendarClock, Link2, BookOpen,
} from "lucide-react";
import BranchLabel from "@/app/components/BranchLabel";

// Real ministries per branch (step M1, db/022). The database decides who
// may do what; this page only shows the matching buttons:
//   Pastor            add / edit / switch off ministries; add or remove
//                     members of any ministry
//   ministry's head   (a Leader set as its login) add or remove members of
//                     their own ministry
//   others            view
// Each ministry lists its own modules (step M3, db/025); the Pastor or the
// ministry's head can add one here. Questions and handouts are managed on
// the Training page.

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#f43f5e", "#06b6d4", "#64748b"];
const EMPTY = { name: "", description: "", head_name: "", leader_id: "", meeting_schedule: "", color_code: COLORS[0], is_active: true, church_id: "" };

function initials(name = "") {
  return name.replace(/&/g, " ").split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "M";
}
const shortDate = (ts) => ts ? new Date(ts).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";

// ─── Theme token map — same pattern as the other dashboard pages ───────────
function T(dark) {
  return {
    pageBg:      dark ? "bg-[#0f111a]"        : "bg-slate-200",
    cardBg:      dark ? "bg-[#1a1d2e]/50"     : "bg-slate-100/90",
    cardBorder:  dark ? "border-slate-800/60"  : "border-slate-300",
    textPrimary: dark ? "text-white"           : "text-slate-900",
    textSub:     dark ? "text-slate-500"       : "text-slate-600",
    textMuted:   dark ? "text-slate-600"       : "text-slate-500",
    inputBg:     dark ? "bg-[#0f111a]"        : "bg-slate-50",
    inputBorder: dark ? "border-slate-800"     : "border-slate-400",
    inputText:   dark ? "text-slate-200"       : "text-slate-800",
    divider:     dark ? "border-slate-800/60"  : "border-slate-300",
    innerCard:   dark ? "bg-slate-900/50"      : "bg-slate-200",
    hoverRow:    dark ? "hover:bg-slate-800/20" : "hover:bg-slate-200",
    emptyIcon:   dark ? "text-slate-700"       : "text-slate-400",
    dashed:      dark ? "border-slate-800"     : "border-slate-400",
    modalBg:     dark ? "bg-[#1a1d2e]"        : "bg-slate-50",
    modalBorder: dark ? "border-slate-700"     : "border-slate-300",
    cancelBtn:   dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-300 hover:bg-slate-400 text-slate-900",
    iconBtn:     dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
  };
}

export default function MinistriesPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);
  const { user, role } = useAuth();
  const isPastor = role === "pastor";
  const isGlobal = GLOBAL_ROLES.includes(role);

  const [ministries, setMinistries]   = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [members, setMembers]         = useState([]);
  const [leaders, setLeaders]         = useState([]);
  const [churches, setChurches]       = useState([]);
  const [branch, setBranch]           = useState("all");
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState(null);
  const [showOff, setShowOff]         = useState(false);

  const [editing, setEditing]   = useState(null);   // ministry being edited, or {} for new
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState("");

  const [addPick, setAddPick]   = useState({});    // ministry id → member id
  const [modules, setModules]   = useState([]);
  const [questionCount, setQuestionCount] = useState({});   // module id → n
  const [newModule, setNewModule] = useState({});  // ministry id → title being typed
  const [busy, setBusy]         = useState(null);

  async function load() {
    const [m, a, mem, lead, ch, mods, qs] = await Promise.all([
      supabase.from("ministries").select("*").order("name"),
      supabase.from("ministry_assignments").select("id, ministry_id, member_id, role, assigned_at"),
      supabase.from("members").select("id, full_name, status, church_id").order("full_name"),
      supabase.from("profiles").select("id, full_name, email, church_id, role").eq("role", "leader"),
      supabase.from("churches").select("id, name").order("name"),
      supabase.from("discipleship_modules").select("id, title, is_active, order_index, ministry_id").not("ministry_id", "is", null).order("order_index"),
      supabase.from("discipleship_questions").select("module_id"),
    ]);
    const qc = {};
    (qs.data || []).forEach((q) => { qc[q.module_id] = (qc[q.module_id] || 0) + 1; });
    return { m: m.data || [], a: a.data || [], mem: mem.data || [], lead: lead.data || [], ch: ch.data || [], mods: mods.data || [], qc };
  }

  function apply({ m, a, mem, lead, ch, mods, qc }) {
    setModules(mods);
    setQuestionCount(qc);
    setMinistries(m);
    setAssignments(a);
    setMembers(mem);
    setLeaders(lead);
    setChurches(ch);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    load().then((d) => { if (!cancelled) apply(d); });
    return () => { cancelled = true; };
  }, []);

  async function refresh() { apply(await load()); }

  // ── Derived ─────────────────────────────────────────────────────────────
  const churchName = (id) => churches.find((c) => c.id === id)?.name || "—";
  const memberById = (id) => members.find((m) => m.id === id);
  const leaderById = (id) => leaders.find((l) => l.id === id);
  const leaderName = (l) => l?.full_name || l?.email || "a Leader";
  const inBranch = (m) => !isGlobal || branch === "all" || m.church_id === branch;
  const shown = ministries.filter(inBranch);
  const active = shown.filter((m) => m.is_active);
  const off = shown.filter((m) => !m.is_active);
  const peopleIn = (ministryId) => assignments.filter((a) => a.ministry_id === ministryId);
  const canAssign = (m) => isPastor || (role === "leader" && m.leader_id && m.leader_id === user?.id);

  // ── Ministry add / edit (Pastor) ────────────────────────────────────────
  function openNew() {
    setForm({ ...EMPTY, church_id: isGlobal ? (branch !== "all" ? branch : "") : "" });
    setFormError("");
    setEditing({});
  }

  function openEdit(m) {
    setForm({
      name: m.name || "", description: m.description || "", head_name: m.head_name || "",
      leader_id: m.leader_id || "", meeting_schedule: m.meeting_schedule || "",
      color_code: m.color_code || COLORS[0], is_active: m.is_active, church_id: m.church_id || "",
    });
    setFormError("");
    setEditing(m);
  }

  async function saveMinistry(e) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Give the ministry a name."); return; }
    if (!form.church_id) { setFormError("Choose the branch."); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      head_name: form.head_name.trim() || null,
      leader_id: form.leader_id || null,
      meeting_schedule: form.meeting_schedule.trim() || null,
      color_code: form.color_code,
      is_active: form.is_active,
      church_id: form.church_id,
    };
    const { error } = editing.id
      ? await supabase.from("ministries").update(payload).eq("id", editing.id)
      : await supabase.from("ministries").insert(payload);
    setSaving(false);
    if (error) {
      setFormError(error.code === "23505" ? "This branch already has a ministry with that name." : "Could not save: " + error.message);
      return;
    }
    setEditing(null);
    await refresh();
  }

  // ── Members of a ministry (Pastor or its head) ──────────────────────────
  async function addMember(m) {
    const memberId = addPick[m.id];
    if (!memberId) return;
    setBusy(m.id);
    const { error } = await supabase.from("ministry_assignments").insert({ ministry_id: m.id, member_id: Number(memberId), role: "member" });
    setBusy(null);
    if (error) {
      alert(error.code === "23505" ? "Already in this ministry." : "Could not add: " + error.message);
      return;
    }
    setAddPick((p) => ({ ...p, [m.id]: "" }));
    await refresh();
  }

  async function removeMember(m, a) {
    const name = memberById(a.member_id)?.full_name || "this member";
    if (!window.confirm(`Remove ${name} from ${m.name}?`)) return;
    setBusy(a.id);
    const { data, error } = await supabase.from("ministry_assignments").delete().eq("id", a.id).select("id");
    setBusy(null);
    if (error || !data?.length) { alert("Could not remove: " + (error?.message || "you don't have permission.")); return; }
    await refresh();
  }

  // ── Modules of a ministry (Pastor or its head) ──────────────────────────
  async function addModule(m) {
    const title = (newModule[m.id] || "").trim();
    if (!title) return;
    setBusy(`mod-${m.id}`);
    const next = modules.filter((x) => x.ministry_id === m.id).reduce((n, x) => Math.max(n, x.order_index || 0), 0) + 1;
    const { error } = await supabase.from("discipleship_modules").insert({ title, ministry_id: m.id, order_index: next, is_active: true });
    setBusy(null);
    if (error) { alert("Could not add the module: " + error.message); return; }
    setNewModule((p) => ({ ...p, [m.id]: "" }));
    await refresh();
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  const input = `w-full ${t.inputBg} border ${t.inputBorder} ${t.inputText} rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 placeholder:text-slate-500`;

  // Called as a function (not <MinistryCard />) so the card isn't rebuilt
  // on every keystroke, which would drop the cursor from its text boxes.
  function renderMinistryCard(m) {
    const isOpen = expanded === m.id;
    const people = peopleIn(m.id);
    const head = m.head_name || (m.leader_id ? leaderName(leaderById(m.leader_id)) : null);
    const assignable = canAssign(m);
    const taken = new Set(people.map((a) => a.member_id));
    const candidates = members.filter((x) => x.church_id === m.church_id && x.status !== "archived" && !taken.has(x.id));
    const ministryModules = modules.filter((x) => x.ministry_id === m.id);

    return (
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl overflow-hidden backdrop-blur-sm ${m.is_active ? "" : "opacity-60"}`}>
        <button onClick={() => setExpanded(isOpen ? null : m.id)}
          className={`w-full flex items-center justify-between gap-4 p-5 ${t.hoverRow} transition-colors text-left`}>
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border"
              style={{ backgroundColor: `${m.color_code || COLORS[0]}1a`, borderColor: `${m.color_code || COLORS[0]}40` }}>
              <span className="text-[11px] font-black" style={{ color: m.color_code || COLORS[0] }}>{initials(m.name)}</span>
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${t.textPrimary} truncate`}>
                {m.name}{!m.is_active && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Off</span>}
              </p>
              <p className={`text-xs ${t.textSub} mt-0.5 truncate`}>
                Head: {head || "not set"}
                {m.meeting_schedule && <> · {m.meeting_schedule}</>}
                {isGlobal && branch === "all" && <> · {churchName(m.church_id)}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <p className={`text-sm font-black ${t.textPrimary}`}>{people.length}</p>
              <p className={`text-[10px] ${t.textMuted} uppercase tracking-wider`}>member{people.length === 1 ? "" : "s"}</p>
            </div>
            {isOpen ? <ChevronDown className={`w-4 h-4 ${t.textSub}`} /> : <ChevronRight className={`w-4 h-4 ${t.emptyIcon}`} />}
          </div>
        </button>

        {isOpen && (
          <div className={`border-t ${t.divider} px-5 py-5 space-y-5`}>
            {m.description && <p className={`text-sm ${t.textSub}`}>{m.description}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`${t.innerCard} rounded-2xl p-3`}>
                <p className={`text-[10px] ${t.textMuted} uppercase tracking-wider mb-1`}>Ministry head</p>
                <p className={`text-sm font-bold ${t.textPrimary}`}>{head || "Not set"}</p>
                {m.leader_id
                  ? <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1"><Link2 size={10} /> Login: {leaderName(leaderById(m.leader_id))}</p>
                  : <p className={`text-[10px] ${t.textMuted} mt-1`}>No login linked — only the Pastor can add members</p>}
              </div>
              <div className={`${t.innerCard} rounded-2xl p-3`}>
                <p className={`text-[10px] ${t.textMuted} uppercase tracking-wider mb-1`}>Meets</p>
                <p className={`text-sm font-bold ${t.textPrimary} flex items-center gap-1.5`}><CalendarClock size={13} /> {m.meeting_schedule || "—"}</p>
              </div>
              <div className={`${t.innerCard} rounded-2xl p-3`}>
                <p className={`text-[10px] ${t.textMuted} uppercase tracking-wider mb-1`}>Members</p>
                <p className={`text-sm font-bold ${t.textPrimary}`}>{people.length} assigned</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>Members</p>
                {isPastor && (
                  <button onClick={() => openEdit(m)} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-bold">
                    <Pencil size={12} /> Edit ministry
                  </button>
                )}
              </div>

              {people.length === 0 ? (
                <p className={`text-xs ${t.textMuted} mb-3`}>No members yet.</p>
              ) : (
                <div className={`border ${t.cardBorder} rounded-2xl divide-y ${t.divider} mb-3`}>
                  {people.map((a) => {
                    const mem = memberById(a.member_id);
                    return (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${t.textPrimary} truncate`}>{mem?.full_name || "Member"}</p>
                          <p className={`text-[10px] ${t.textMuted}`}>
                            Since {shortDate(a.assigned_at)}{mem?.status && mem.status !== "active" && <> · {mem.status}</>}
                          </p>
                        </div>
                        {assignable && (
                          <button onClick={() => removeMember(m, a)} disabled={busy === a.id} title="Remove from ministry"
                            className={`${t.textSub} hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 disabled:opacity-50`}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {assignable && m.is_active && (
                <div className="flex gap-2">
                  <select value={addPick[m.id] || ""} onChange={(e) => setAddPick((p) => ({ ...p, [m.id]: e.target.value }))} className={input}>
                    <option value="">{candidates.length ? "Choose a member to add…" : "Everyone in this branch is already in it"}</option>
                    {candidates.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                  </select>
                  <button onClick={() => addMember(m)} disabled={!addPick[m.id] || busy === m.id}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-4 rounded-xl shrink-0">
                    {busy === m.id ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Add
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>Training modules</p>
                <Link href="/dashboard/training" className="text-xs text-blue-400 hover:text-blue-300 font-bold">
                  Questions &amp; handouts on Training →
                </Link>
              </div>
              {ministryModules.length === 0 ? (
                <p className={`text-xs ${t.textMuted} mb-3`}>No modules for this ministry yet. Members still follow the general discipleship path.</p>
              ) : (
                <div className={`border ${t.cardBorder} rounded-2xl divide-y ${t.divider} mb-3`}>
                  {ministryModules.map((x, i) => (
                    <div key={x.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={`text-xs font-black ${t.textMuted} w-5`}>{i + 1}</span>
                      <BookOpen size={14} className="text-blue-400 shrink-0" />
                      <p className={`flex-1 min-w-0 text-sm font-semibold ${t.textPrimary} truncate`}>{x.title}</p>
                      <span className={`text-[10px] ${t.textMuted}`}>{questionCount[x.id] || 0} question{questionCount[x.id] === 1 ? "" : "s"}</span>
                      {!x.is_active && <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hidden</span>}
                    </div>
                  ))}
                </div>
              )}
              {assignable && m.is_active && (
                <div className="flex gap-2">
                  <input value={newModule[m.id] || ""} onChange={(e) => setNewModule((p) => ({ ...p, [m.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addModule(m); }}
                    placeholder={`New module for ${m.name}…`} className={input} />
                  <button onClick={() => addModule(m)} disabled={!(newModule[m.id] || "").trim() || busy === `mod-${m.id}`}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-4 rounded-xl shrink-0">
                    {busy === `mod-${m.id}` ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} ${t.textPrimary} transition-colors duration-200 space-y-6`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}><BranchLabel /></p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Ministries</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Ministry teams, their heads and members</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0`}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {isPastor && (
            <button onClick={openNew}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shrink-0">
              <Plus size={16} /> Add ministry
            </button>
          )}
        </div>
      </div>

      {isGlobal && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>Branch</span>
          <select value={branch} onChange={(e) => setBranch(e.target.value)}
            className={`w-full sm:w-auto ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 px-4 text-sm ${t.inputText} focus:outline-none focus:border-blue-500`}>
            <option value="all">All branches</option>
            {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className={`flex items-center justify-center gap-2 py-14 ${t.textMuted} text-sm`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading ministries...
        </div>
      ) : active.length === 0 && off.length === 0 ? (
        <div className={`py-16 text-center border border-dashed ${t.dashed} rounded-3xl`}>
          <Users className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-3`} />
          <p className={`${t.textMuted} text-sm`}>No ministries in this branch yet.</p>
          {isPastor && <p className={`${t.textMuted} text-xs mt-1`}>Use “Add ministry” to create the first one.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((m) => <div key={m.id}>{renderMinistryCard(m)}</div>)}
          {off.length > 0 && isPastor && (
            <>
              <button onClick={() => setShowOff((v) => !v)} className={`text-xs font-bold ${t.textSub} hover:text-blue-400 flex items-center gap-1 pt-2`}>
                {showOff ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Switched off ({off.length})
              </button>
              {showOff && off.map((m) => <div key={m.id}>{renderMinistryCard(m)}</div>)}
            </>
          )}
        </div>
      )}

      <div className={`${t.cardBg} border border-dashed ${t.dashed} rounded-3xl p-5 flex items-center gap-3`}>
        <BookOpen className={`w-5 h-5 ${t.emptyIcon} shrink-0`} />
        <p className={`text-xs ${t.textMuted}`}>General discipleship modules, questions and handouts are managed on the <span className="font-bold">Training</span> page.</p>
      </div>

      {/* Add / edit ministry (Pastor) */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-center mb-5">
              <h2 className={`text-lg font-black ${t.textPrimary}`}>{editing.id ? "Edit ministry" : "Add ministry"}</h2>
              <button onClick={() => setEditing(null)} className={`${t.textSub} hover:text-blue-400`}><X size={18} /></button>
            </div>
            <form onSubmit={saveMinistry} className="space-y-4">
              <Field t={t} label="Branch">
                <select value={form.church_id} disabled={!!editing.id}
                  onChange={(e) => setForm({ ...form, church_id: e.target.value, leader_id: "" })} className={`${input} disabled:opacity-60`}>
                  <option value="">Choose a branch</option>
                  {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field t={t} label="Name">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Youth Ministry" className={input} />
              </Field>
              <Field t={t} label="Description (optional)">
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${input} resize-none`} />
              </Field>
              <Field t={t} label="Head's name">
                <input value={form.head_name} onChange={(e) => setForm({ ...form, head_name: e.target.value })} placeholder="e.g. Mr. Juan dela Cruz" className={input} />
              </Field>
              <Field t={t} label="Head's login (optional — lets them add members)">
                <select value={form.leader_id} onChange={(e) => setForm({ ...form, leader_id: e.target.value })} className={input}>
                  <option value="">No login linked</option>
                  {leaders.filter((l) => l.church_id === form.church_id).map((l) => (
                    <option key={l.id} value={l.id}>{leaderName(l)}</option>
                  ))}
                </select>
              </Field>
              <Field t={t} label="Meets (optional)">
                <input value={form.meeting_schedule} onChange={(e) => setForm({ ...form, meeting_schedule: e.target.value })} placeholder="e.g. Saturdays 4:00 PM" className={input} />
              </Field>
              <Field t={t} label="Colour">
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button type="button" key={c} onClick={() => setForm({ ...form, color_code: c })}
                      className={`w-8 h-8 rounded-full border-2 ${form.color_code === c ? "border-white" : "border-transparent"}`}
                      style={{ backgroundColor: c }} aria-label={c} />
                  ))}
                </div>
              </Field>
              {editing.id && (
                <label className={`flex items-center gap-2 text-sm ${t.textPrimary} cursor-pointer w-fit`}>
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  Active (untick to switch it off; members stay assigned)
                </label>
              )}
              {formError && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{formError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditing(null)} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold`}>Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold">
                  {saving ? "Saving..." : editing.id ? "Save changes" : "Add ministry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ t, label, children }) {
  return (
    <div>
      <label className={`block text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1.5`}>{label}</label>
      {children}
    </div>
  );
}
