'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import { useAuth } from "@/app/context/AuthContext";
import { ROLES, ROLE_LABELS, GLOBAL_ROLES } from "@/app/lib/permissions";
import { Search, UserCog, Sun, Moon } from "lucide-react";

// Admin sets each login's level and branch. The database enforces the same
// rules (db/009): only an admin changes levels or branches, and nobody
// changes their own level. Logins are still created by signing up.

const LEVEL_COLORS = {
  admin:     "bg-rose-500/10 text-rose-400 border-rose-500/20",
  pastor:    "bg-violet-500/10 text-violet-400 border-violet-500/20",
  leader:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  finance:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  secretary: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  member:    "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function getInitials(name = "") {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function displayName(u) {
  return u.full_name || u.email?.split("@")[0] || "Unnamed user";
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
    tableHeadBg: dark ? "bg-slate-900/50"      : "bg-slate-200",
    rowHover:    dark ? "hover:bg-blue-500/5"  : "hover:bg-blue-100/60",
    iconBtn:     dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
  };
}

export default function UsersPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);
  const { user } = useAuth();

  const [users, setUsers]             = useState([]);
  const [churches, setChurches]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [savingId, setSavingId]       = useState(null);
  const [search, setSearch]           = useState("");
  const [filterLevel, setFilterLevel] = useState("all");
  const [filterChurch, setFilterChurch] = useState("all");

  // ── Data ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [{ data: profiles }, { data: churchList }] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, role, church_id').order('full_name'),
        supabase.from('churches').select('id, name').order('name'),
      ]);
      setUsers(profiles || []);
      setChurches(churchList || []);
      setLoading(false);
    }
    load();
  }, []);

  const churchName = (id) => churches.find((c) => c.id === id)?.name;

  // ── Save one change ───────────────────────────────────────────────────────

  async function saveChange(u, changes, question) {
    if (!window.confirm(question)) return;
    setSavingId(u.id);
    // .select() returns the saved row, so a change the database refused
    // (no matching rule) shows up as an empty result instead of passing silently.
    const { data, error } = await supabase
      .from('profiles')
      .update(changes)
      .eq('id', u.id)
      .select('id, role, church_id');
    setSavingId(null);

    if (error || !data?.length) {
      alert('Could not save: ' + (error?.message || 'you do not have permission to change this user.'));
      return;
    }
    setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, ...data[0] } : p)));
  }

  function handleLevelChange(u, role) {
    if (role === u.role) return;
    if (!GLOBAL_ROLES.includes(role) && !u.church_id) {
      alert(`Pick a branch for ${displayName(u)} first. Only Admin and Pastor work without one.`);
      return;
    }
    saveChange(u, { role }, `Change ${displayName(u)} from ${ROLE_LABELS[u.role] || u.role} to ${ROLE_LABELS[role]}?`);
  }

  function handleChurchChange(u, churchId) {
    const church_id = churchId || null;
    if (church_id === u.church_id) return;
    const to = church_id ? churchName(church_id) : 'no branch';
    saveChange(u, { church_id }, `Move ${displayName(u)} to ${to}?`);
  }

  // ── Filtered list + counts ────────────────────────────────────────────────

  const q = search.toLowerCase();
  const filtered = users.filter((u) => {
    const matchSearch = u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    const matchLevel  = filterLevel === "all" || u.role === filterLevel;
    const matchChurch = filterChurch === "all" || (filterChurch === "none" ? !u.church_id : u.church_id === filterChurch);
    return (!q || matchSearch) && matchLevel && matchChurch;
  });

  const countFor = (role) => users.filter((u) => u.role === role).length;

  const selectStyle = `${t.inputBg} border ${t.inputBorder} rounded-xl py-2 px-3 text-sm ${t.inputText} focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50`;

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}>All branches</p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Users</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Set each login&apos;s level and branch. New people sign up themselves and start as Member.</p>
        </div>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0 self-start`}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Count per level — click to filter */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {ROLES.map((r) => (
          <button
            key={r}
            onClick={() => setFilterLevel(filterLevel === r ? "all" : r)}
            className={`text-left ${t.cardBg} border rounded-2xl px-4 py-3 backdrop-blur-sm transition-colors ${
              filterLevel === r ? "border-blue-500" : t.cardBorder
            }`}
          >
            <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1`}>{ROLE_LABELS[r]}</p>
            <p className={`text-2xl font-black ${t.textPrimary}`}>{countFor(r)}</p>
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-2.5 w-4 h-4 ${t.textSub}`} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 pl-9 pr-4 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
          />
        </div>
        <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className={selectStyle}>
          <option value="all">All levels</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select value={filterChurch} onChange={(e) => setFilterChurch(e.target.value)} className={selectStyle}>
          <option value="all">All branches</option>
          {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="none">No branch</option>
        </select>
      </div>

      {/* Table */}
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl overflow-hidden backdrop-blur-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={`${t.tableHeadBg} text-[10px] uppercase tracking-widest ${t.textSub} font-bold border-b ${t.cardBorder}`}>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Level</th>
                <th className="px-6 py-4">Branch</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${t.divider}`}>
              {loading ? (
                <tr>
                  <td colSpan={3} className={`text-center py-14 ${t.textSub} text-sm`}>Loading users...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-14">
                    <UserCog className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
                    <p className={`${t.textSub} text-sm`}>No users match your search.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const isMe   = u.id === user?.id;
                  const saving = savingId === u.id;
                  return (
                    <tr key={u.id} className={`${t.rowHover} transition-colors`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-black text-blue-400">{getInitials(displayName(u))}</span>
                          </div>
                          <div className="min-w-0">
                            <p className={`font-semibold ${t.textPrimary} text-sm truncate`}>
                              {displayName(u)}
                              {isMe && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-blue-400">You</span>}
                            </p>
                            <p className={`text-xs ${t.textSub} truncate`}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isMe ? (
                          <span
                            title="You can't change your own level. Ask another admin."
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${LEVEL_COLORS[u.role] || LEVEL_COLORS.member}`}
                          >
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                        ) : (
                          <select
                            value={u.role || 'member'}
                            disabled={saving}
                            onChange={(e) => handleLevelChange(u, e.target.value)}
                            className={selectStyle}
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={u.church_id || ''}
                          disabled={saving}
                          onChange={(e) => handleChurchChange(u, e.target.value)}
                          className={selectStyle}
                        >
                          {/* Only Admin and Pastor may have no branch. */}
                          {(!u.church_id || GLOBAL_ROLES.includes(u.role)) && <option value="">No branch</option>}
                          {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
