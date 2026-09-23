'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import { UserPlus, MoreVertical, X, Trash2, Pencil, Search, Users, Sun, Moon } from "lucide-react";

const EMPTY_FORM = {
  full_name: '',
  role: '',
  ministry: '',
  status: 'active',
  phone: '',
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
};

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

  // ── Data ──────────────────────────────────────────────────────────────────

  async function fetchMembers() {
    setLoading(true);
    const { data } = await supabase.from('members').select('*').order('full_name');
    if (data) setMembers(data);
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

    if (editingMember) {
      const { error } = await supabase
        .from('members')
        .update(form)
        .eq('id', editingMember.id);
      if (error) alert('Error updating member: ' + error.message);
    } else {
      const { error } = await supabase.from('members').insert([form]);
      if (error) alert('Error saving member: ' + error.message);
    }

    setSaving(false);
    setShowModal(false);
    setEditingMember(null);
    setForm(EMPTY_FORM);
    await fetchMembers();
  }

  async function handleDelete(member) {
    const confirmed = window.confirm(`Delete "${member.full_name}"?`);
    if (!confirmed) return;
    setOpenMenuId(null);

    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', member.id);

    if (error) {
      alert('Error deleting member: ' + error.message);
      return;
    }

    await fetchMembers();
  }

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = members.filter((m) => {
    const matchSearch =
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.ministry?.toLowerCase().includes(search.toLowerCase()) ||
      m.role?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || m.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Summary counts ────────────────────────────────────────────────────────

  const counts = {
    total:    members.length,
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
          <button
            onClick={openAdd}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shrink-0"
          >
            <UserPlus size={16} />
            Add Member
          </button>
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
          {["all", "active", "busy", "inactive"].map((s) => (
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
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className={`divide-y ${t.divider}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className={`text-center py-14 ${t.textSub} text-sm`}>
                    Loading congregation data...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14">
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
                    <td className="px-6 py-4 text-center">
                      <span className={`border text-[10px] uppercase font-bold px-3 py-1 rounded-full ${STATUS_COLORS[member.status] || STATUS_COLORS.active}`}>
                        {member.status || 'active'}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => handleMenuOpen(e, member.id)}
                        className={`transition-colors p-1 rounded-lg ${t.actionBtn}`}
                      >
                        <MoreVertical size={15} />
                      </button>
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
            Showing {filtered.length} of {members.length} members
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
            <button
              onClick={() => openEdit(activeMenuMember)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textSub} ${t.menuHover} transition-colors`}
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              onClick={() => handleDelete(activeMenuMember)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </>
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