'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import { useAuth } from "@/app/context/AuthContext";
import { can } from "@/app/lib/permissions";
import { authFetch } from "@/app/lib/authFetch";
import { UserPlus, MoreVertical, X, Archive, ArchiveRestore, Pencil, Search, Users, Sun, Moon, KeyRound, Copy, Check, Link2, Unlink } from "lucide-react";

const EMPTY_FORM = {
  full_name: '',
  role: '',
  ministry: '',
  status: 'active',
  phone: '',
  email: '',
};

const MINISTRIES = [
  "Program & Music Ministry",
  "Mission & Evangelism",
  "Training & Life Ministry",
  "Building & Equipment",
  "Finance Ministry",
];

const STATUS_COLORS = {
  active:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  busy:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  inactive: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  archived: "bg-slate-500/5 text-slate-500 border-slate-500/30",
};

// Members are archived, never deleted. Archived members drop out of the
// directory and every count, and show only under the "archived" filter.
const ARCHIVED = 'archived';

// How alike a login's name/email is to a member's name, for sorting the
// "Link existing login" list: shared words count most.
function nameScore(memberName = "", login) {
  const words = (str) => (str || "").toLowerCase().split(/[^a-z0-9ñ]+/).filter((w) => w.length > 1);
  const target = words(memberName);
  const theirs = new Set([...words(login.full_name), ...words(login.email?.split("@")[0])]);
  return target.filter((w) => theirs.has(w)).length;
}

function getInitials(name = "") {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

// ─── Theme token map — same pattern as DashboardPage.js ────────────────────
// Light mode is deliberately dimmed a notch off pure white/slate-100 (~90%
// as bright) so it doesn't glare next to the dark theme.
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
    filterInactive: dark ? "bg-[#1a1d2e] border-slate-800 text-slate-500 hover:text-slate-200" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
    modalBg:     dark ? "bg-[#1a1d2e]"        : "bg-slate-50",
    modalBorder: dark ? "border-slate-700"     : "border-slate-300",
    cancelBtn:   dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-300 hover:bg-slate-400 text-slate-900",
    emptyIcon:   dark ? "text-slate-700"       : "text-slate-400",
    tableHeadBg: dark ? "bg-slate-900/50"      : "bg-slate-200",
    rowHover:    dark ? "hover:bg-blue-500/5"  : "hover:bg-blue-100/60",
    menuBg:      dark ? "bg-[#1a1d2e] border-slate-700" : "bg-slate-50 border-slate-300",
    menuHover:   dark ? "hover:bg-slate-800"    : "hover:bg-slate-200",
    actionBtn:   dark ? "text-slate-600 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200",
    iconBtn:     dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
  };
}

// Accent color for content text — the -400 shades read fine on the dark bg
// but are too pale for contrast on light.
const ACCENT = {
  emerald: { dark: "text-emerald-400", light: "text-emerald-600" },
  orange:  { dark: "text-orange-400",  light: "text-orange-600" },
};
function A(dark, color) {
  return dark ? ACCENT[color].dark : ACCENT[color].light;
}

export default function MembersPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);
  const { role } = useAuth();
  // Secretary adds and edits; Pastor and Secretary archive; others view.
  const canEdit    = can(role, 'members', 'edit');
  const canArchive = can(role, 'memberArchive', 'edit');

  const [members, setMembers]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(false);
  const [saving, setSaving]               = useState(false);
  const [openMenuId, setOpenMenuId]       = useState(null);
  const [menuPos, setMenuPos]             = useState({ top: 0, right: 0 });
  const [editingMember, setEditingMember] = useState(null);
  const [search, setSearch]               = useState("");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [form, setForm]                   = useState(EMPTY_FORM);
  // Logins linked to member records (db/014): profile id → profile.
  const [logins, setLogins]               = useState({});
  const [creatingLoginId, setCreatingLoginId] = useState(null);
  const [newLogin, setNewLogin]           = useState(null);   // { name, email, password }
  const [copied, setCopied]               = useState(false);
  // Step E3: link a login that already exists (self sign-up) to a record.
  const [linkFor, setLinkFor]             = useState(null);   // member being linked
  const [candidates, setCandidates]       = useState([]);
  const [linkSearch, setLinkSearch]       = useState("");
  const [linkLoading, setLinkLoading]     = useState(false);
  const [linkingId, setLinkingId]         = useState(null);

  // ── Data ──────────────────────────────────────────────────────────────────

  async function fetchMembers() {
    setLoading(true);
    const { data } = await supabase.from('members').select('*').order('full_name');
    if (data) setMembers(data);
    const ids = (data || []).map((m) => m.profile_id).filter(Boolean);
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, email, full_name, disabled').in('id', ids);
      const map = {};
      (profiles || []).forEach((p) => { map[p.id] = p; });
      setLogins(map);
    }
    setLoading(false);
  }

  useEffect(() => { fetchMembers(); }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingMember(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(member) {
    setEditingMember(member);
    setForm({
      full_name: member.full_name || '',
      role:      member.role      || '',
      ministry:  member.ministry  || '',
      status:    member.status    || 'active',
      phone:     member.phone     || '',
      email:     member.email     || '',
    });
    setOpenMenuId(null);
    setShowModal(true);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleMenuOpen(e, memberId) {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + window.scrollY + 4,
      right: window.innerWidth - rect.right,
    });
    setOpenMenuId(openMenuId === memberId ? null : memberId);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, email: form.email.trim().toLowerCase() || null };

    if (editingMember) {
      const { error } = await supabase
        .from('members')
        .update(payload)
        .eq('id', editingMember.id);
      if (error) alert('Error updating member: ' + error.message);
    } else {
      const { error } = await supabase.from('members').insert([payload]);
      if (error) alert('Error saving member: ' + error.message);
    }

    setSaving(false);
    setShowModal(false);
    setEditingMember(null);
    setForm(EMPTY_FORM);
    await fetchMembers();
  }

  async function handleArchive(member, archive) {
    const confirmed = window.confirm(archive
      ? `Archive "${member.full_name}"? They'll be hidden from the directory and counts, and can be restored later.`
      : `Restore "${member.full_name}" as an active member?`);
    if (!confirmed) return;
    setOpenMenuId(null);

    const { data, error } = await supabase
      .from('members')
      .update({ status: archive ? ARCHIVED : 'active' })
      .eq('id', member.id)
      .select('id');

    if (error) {
      alert('Error updating member: ' + error.message);
      return;
    }
    if (!data?.length) {
      alert("You don't have permission to change this member.");
      return;
    }

    await fetchMembers();
  }

  // Secretary: create a login for this member (server route, db/014).
  async function handleCreateLogin(member) {
    const loginName = member.email || 'a made-up username';
    if (!window.confirm(`Create a login for ${member.full_name}? It will use ${loginName} and a temporary password that they change on first sign-in.`)) return;
    setCreatingLoginId(member.id);
    try {
      const res = await authFetch('/api/members/create-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: member.id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Could not create the login.'); return; }
      setCopied(false);
      setNewLogin({ name: member.full_name, email: data.email, password: data.password });
      await fetchMembers();
    } catch (err) {
      alert('Could not create the login: ' + err.message);
    } finally {
      setCreatingLoginId(null);
    }
  }

  async function copyNewLogin() {
    if (!newLogin) return;
    try {
      await navigator.clipboard.writeText(`FaithSync login\nUsername: ${newLogin.email}\nTemporary password: ${newLogin.password}`);
      setCopied(true);
    } catch {
      alert('Could not copy — please write the details down instead.');
    }
  }

  // E3: logins in this branch that aren't linked to any member record yet.
  // (People who signed up themselves appear once the Admin sets their branch.)
  async function openLinkExisting(member) {
    setLinkFor(member);
    setLinkSearch("");
    setLinkLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, disabled')
      .eq('disabled', false);
    const taken = new Set(members.map((m) => m.profile_id).filter(Boolean));
    setCandidates((data || []).filter((p) => !taken.has(p.id)));
    setLinkLoading(false);
  }

  async function linkExisting(login) {
    const who = login.full_name || login.email;
    if (!window.confirm(`Link ${who} (${login.email || 'no email'}) to the member record "${linkFor.full_name}"?`)) return;
    setLinkingId(login.id);
    const { data, error } = await supabase
      .from('members')
      .update({ profile_id: login.id })
      .eq('id', linkFor.id)
      .is('profile_id', null)
      .select('id');
    setLinkingId(null);
    if (error) {
      alert(error.code === '23505'
        ? 'That login is already linked to another member record.'
        : 'Could not link: ' + error.message);
      return;
    }
    if (!data?.length) { alert('Could not link — this member may already have a login.'); return; }
    setLinkFor(null);
    await fetchMembers();
  }

  async function unlinkLogin(member) {
    setOpenMenuId(null);
    if (!window.confirm(`Unlink the login from "${member.full_name}"? The login itself keeps working; it just won't be connected to this member record.`)) return;
    const { data, error } = await supabase
      .from('members')
      .update({ profile_id: null })
      .eq('id', member.id)
      .select('id');
    if (error || !data?.length) { alert('Could not unlink: ' + (error?.message || "you don't have permission.")); return; }
    await fetchMembers();
  }

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = members.filter((m) => {
    const matchSearch =
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.ministry?.toLowerCase().includes(search.toLowerCase()) ||
      m.role?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" ? m.status !== ARCHIVED : m.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Summary counts ────────────────────────────────────────────────────────

  const counts = {
    total:    members.filter((m) => m.status !== ARCHIVED).length,
    active:   members.filter((m) => m.status === "active").length,
    inactive: members.filter((m) => m.status === "inactive").length,
    busy:     members.filter((m) => m.status === "busy").length,
  };

  // ── Active member for dropdown ────────────────────────────────────────────

  const activeMenuMember = members.find((m) => m.id === openMenuId) || null;

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} transition-colors duration-200`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}>GGCF-GMI · Pandi, Bulacan</p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Member Database</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Congregation records and ministry assignments</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-full border ${t.iconBtn} transition-colors shrink-0`}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {canEdit && (
            <button
              onClick={openAdd}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shrink-0"
            >
              <UserPlus size={16} />
              Add Member
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Members", value: counts.total,    color: t.textPrimary },
          { label: "Active",        value: counts.active,   color: A(dark, "emerald") },
          { label: "Busy",          value: counts.busy,     color: A(dark, "orange") },
          { label: "Inactive",      value: counts.inactive, color: t.textMuted },
        ].map((c) => (
          <div key={c.label} className={`${t.cardBg} border ${t.cardBorder} rounded-2xl px-5 py-4 backdrop-blur-sm`}>
            <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1`}>{c.label}</p>
            <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-2.5 w-4 h-4 ${t.textSub}`} />
          <input
            type="text"
            placeholder="Search by name, role, or ministry..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 pl-9 pr-4 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "active", "busy", "inactive", ARCHIVED].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                filterStatus === s
                  ? "bg-blue-600 text-white"
                  : t.filterInactive
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl overflow-hidden backdrop-blur-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={`${t.tableHeadBg} text-[10px] uppercase tracking-widest ${t.textSub} font-bold border-b ${t.cardBorder}`}>
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Ministry</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Login</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className={`divide-y ${t.divider}`}>
              {loading ? (
                <tr>
                  <td colSpan={7} className={`text-center py-14 ${t.textSub} text-sm`}>
                    Loading congregation data...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-14">
                    <Users className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
                    <p className={`${t.textSub} text-sm`}>
                      {search || filterStatus !== "all" ? "No members match your search." : "No members yet. Add one!"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((member) => (
                  <tr key={member.id} className={`${t.rowHover} transition-colors`}>
                    {/* Name + Avatar */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-black text-blue-400">{getInitials(member.full_name)}</span>
                        </div>
                        <span className={`font-semibold ${t.textPrimary} text-sm`}>{member.full_name}</span>
                      </div>
                    </td>
                    <td className={`px-6 py-4 ${t.textSub} text-sm capitalize`}>{member.role || '—'}</td>
                    <td className="px-6 py-4 text-blue-400 text-xs font-medium">{member.ministry || '—'}</td>
                    <td className={`px-6 py-4 ${t.textSub} text-sm`}>{member.phone || '—'}</td>
                    <td className="px-6 py-4">
                      {member.profile_id ? (
                        <span className={`text-xs ${t.textSub} break-all`}>
                          {logins[member.profile_id]?.email || 'Linked'}
                          {logins[member.profile_id]?.disabled && <span className="ml-1 text-rose-400 font-bold">(disabled)</span>}
                        </span>
                      ) : canEdit && member.status !== ARCHIVED ? (
                        <div className="flex flex-col items-start gap-1">
                          <button
                            onClick={() => handleCreateLogin(member)}
                            disabled={creatingLoginId === member.id}
                            className="flex items-center gap-1.5 text-xs font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            <KeyRound size={12} /> {creatingLoginId === member.id ? 'Creating...' : 'Create login'}
                          </button>
                          <button
                            onClick={() => openLinkExisting(member)}
                            className={`flex items-center gap-1 text-[11px] font-semibold ${t.textSub} hover:text-blue-400 transition-colors whitespace-nowrap`}
                          >
                            <Link2 size={11} /> or link existing
                          </button>
                        </div>
                      ) : (
                        <span className={`text-xs ${t.textMuted}`}>No login</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`border text-[10px] uppercase font-bold px-3 py-1 rounded-full ${STATUS_COLORS[member.status] || STATUS_COLORS.active}`}>
                        {member.status || 'active'}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      {(canEdit || canArchive) && (
                        <button
                          onClick={(e) => handleMenuOpen(e, member.id)}
                          className={`transition-colors p-1 rounded-lg ${t.actionBtn}`}
                        >
                          <MoreVertical size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div className={`px-6 py-3 border-t ${t.divider} text-[10px] ${t.textMuted} uppercase tracking-widest`}>
            Showing {filtered.length} of {counts.total} members
          </div>
        )}
      </div>

      {/* ── Dropdown Menu (rendered outside table) ── */}
      {openMenuId && activeMenuMember && (
        <>
          {/* Backdrop to close on outside click */}
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
          {/* Menu */}
          <div
            className={`fixed z-50 ${t.menuBg} border rounded-xl shadow-xl w-36 overflow-hidden`}
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {canEdit && activeMenuMember.status !== ARCHIVED && (
              <button
                onClick={() => openEdit(activeMenuMember)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textSub} ${t.menuHover} transition-colors`}
              >
                <Pencil size={13} /> Edit
              </button>
            )}
            {canEdit && activeMenuMember.profile_id && (
              <button
                onClick={() => unlinkLogin(activeMenuMember)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textSub} ${t.menuHover} transition-colors`}
              >
                <Unlink size={13} /> Unlink login
              </button>
            )}
            {canArchive && (activeMenuMember.status === ARCHIVED ? (
              <button
                onClick={() => handleArchive(activeMenuMember, false)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textSub} ${t.menuHover} transition-colors`}
              >
                <ArchiveRestore size={13} /> Restore
              </button>
            ) : (
              <button
                onClick={() => handleArchive(activeMenuMember, true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Archive size={13} /> Archive
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Link an existing login (E3) ── */}
      {linkFor && (() => {
        const q = linkSearch.toLowerCase();
        const list = candidates
          .filter((c) => !q || c.full_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
          .map((c) => ({ ...c, score: nameScore(linkFor.full_name, c) }))
          .sort((a, b) => b.score - a.score || (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-lg p-6 shadow-2xl mx-4 max-h-[85vh] flex flex-col`}>
              <div className="flex justify-between items-start mb-1">
                <h2 className={`text-lg font-black ${t.textPrimary}`}>Link existing login</h2>
                <button onClick={() => setLinkFor(null)} className={`${t.textSub} hover:text-blue-400 transition-colors`}><X size={18} /></button>
              </div>
              <p className={`text-xs ${t.textSub} mb-4`}>
                Pick the login that belongs to <span className="font-bold">{linkFor.full_name}</span>. Closest name matches are first.
                Someone who signed up themselves appears here once the Admin has set their branch.
              </p>
              <div className="relative mb-3">
                <Search className={`absolute left-3 top-2.5 w-4 h-4 ${t.textSub}`} />
                <input
                  type="text"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder="Search name or email..."
                  className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 pl-9 pr-4 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
                />
              </div>
              <div className={`flex-1 overflow-y-auto border ${t.cardBorder} rounded-xl divide-y ${t.divider}`}>
                {linkLoading ? (
                  <p className={`text-center py-8 text-sm ${t.textSub}`}>Loading logins...</p>
                ) : list.length === 0 ? (
                  <p className={`text-center py-8 text-sm ${t.textSub}`}>No unlinked logins in this branch.</p>
                ) : list.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${t.textPrimary} truncate`}>
                        {c.full_name || c.email?.split('@')[0] || 'Unnamed'}
                        {c.score > 0 && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">Match</span>}
                      </p>
                      <p className={`text-xs ${t.textSub} truncate`}>{c.email || 'No email'} · <span className="capitalize">{c.role}</span></p>
                    </div>
                    <button
                      onClick={() => linkExisting(c)}
                      disabled={linkingId === c.id}
                      className="flex items-center gap-1.5 text-xs font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Link2 size={12} /> {linkingId === c.id ? 'Linking...' : 'Link'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── New login details (shown once) ── */}
      {newLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4`}>
            <h2 className={`text-lg font-black ${t.textPrimary} mb-1`}>Login created</h2>
            <p className={`text-xs ${t.textSub} mb-5`}>
              Give these to <span className="font-bold">{newLogin.name}</span>. The password won&apos;t be shown again —
              they&apos;ll choose their own the first time they sign in.
            </p>
            <div className={`${t.inputBg} border ${t.inputBorder} rounded-xl p-4 space-y-3 mb-5`}>
              <div>
                <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>Username</p>
                <p className={`text-sm font-mono ${t.textPrimary} break-all select-all`}>{newLogin.email}</p>
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold`}>Temporary password</p>
                <p className={`text-lg font-mono font-bold ${t.textPrimary} tracking-wider select-all`}>{newLogin.password}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={copyNewLogin}
                className={`flex-1 flex items-center justify-center gap-2 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold transition-all`}
              >
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
              <button
                onClick={() => { if (copied || window.confirm("Close? You won't see this password again.")) setNewLogin(null); }}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2.5 text-sm font-bold transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-lg font-black ${t.textPrimary}`}>
                {editingMember ? "Edit Member" : "Add New Member"}
              </h2>
              <button onClick={() => setShowModal(false)} className={`${t.textSub} hover:text-blue-400 transition-colors`}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Full Name" required t={t}>
                <input
                  type="text" name="full_name" value={form.full_name}
                  onChange={handleChange} required
                  placeholder="e.g. Juan dela Cruz"
                  className={inputStyle(t)}
                />
              </Field>

              <Field label="Role" t={t}>
                <select name="role" value={form.role} onChange={handleChange} className={inputStyle(t)}>
                  <option value="">Select a role</option>
                  <option value="pastor">Pastor</option>
                  <option value="leader">Leader</option>
                  <option value="member">Member</option>
                  <option value="volunteer">Volunteer</option>
                </select>
              </Field>

              <Field label="Ministry" t={t}>
                <select name="ministry" value={form.ministry} onChange={handleChange} className={inputStyle(t)}>
                  <option value="">Select a ministry</option>
                  {MINISTRIES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>

              <Field label="Phone" t={t}>
                <input
                  type="tel" name="phone" value={form.phone}
                  onChange={handleChange}
                  placeholder="e.g. 09XX XXX XXXX"
                  className={inputStyle(t)}
                />
              </Field>

              <Field label="Email (optional)" t={t}>
                <input
                  type="email" name="email" value={form.email}
                  onChange={handleChange}
                  placeholder="Used as their login name, if given"
                  className={inputStyle(t)}
                />
              </Field>

              <Field label="Status" t={t}>
                <select name="status" value={form.status} onChange={handleChange} className={inputStyle(t)}>
                  <option value="active">Active</option>
                  <option value="busy">Busy</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold transition-all`}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                  {saving ? 'Saving...' : editingMember ? 'Save Changes' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function inputStyle(t) {
  return `w-full ${t.inputBg} border ${t.inputBorder} ${t.inputText} rounded-xl px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 placeholder:text-slate-500`;
}

function Field({ label, required, t, children }) {
  return (
    <div>
      <label className={`block text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1.5`}>
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}