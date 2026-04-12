'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { UserPlus, MoreVertical, X, Trash2, Pencil, Search, Users } from "lucide-react";

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

export default function MembersPage() {
  const [members, setMembers]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm]             = useState(EMPTY_FORM);

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
    const { error } = await supabase.from('members').delete().eq('id', member.id);
    if (error) alert('Error deleting member: ' + error.message);
    else setMembers(members.filter((m) => m.id !== member.id));
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

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 min-h-screen bg-[#0f111a]">

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h1 className="text-2xl font-black text-white">Member Database</h1>
          <p className="text-slate-500 text-sm mt-0.5">Congregation records and ministry assignments</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
        >
          <UserPlus size={16} />
          Add Member
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Members", value: counts.total,    color: "text-white" },
          { label: "Active",        value: counts.active,   color: "text-emerald-400" },
          { label: "Busy",          value: counts.busy,     color: "text-orange-400" },
          { label: "Inactive",      value: counts.inactive, color: "text-slate-400" },
        ].map((c) => (
          <div key={c.label} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-2xl px-5 py-4 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{c.label}</p>
            <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, role, or ministry..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1a1d2e] border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {["all", "active", "busy", "inactive"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                filterStatus === s
                  ? "bg-blue-600 text-white"
                  : "bg-[#1a1d2e] border border-slate-800 text-slate-500 hover:text-slate-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/50 text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-800/60">
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Ministry</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-slate-500 text-sm">
                    Loading congregation data...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14">
                    <Users className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">
                      {search || filterStatus !== "all" ? "No members match your search." : "No members yet. Add one!"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((member) => (
                  <tr key={member.id} className="hover:bg-blue-500/5 transition-colors">
                    {/* Name + Avatar */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-black text-blue-400">{getInitials(member.full_name)}</span>
                        </div>
                        <span className="font-semibold text-white text-sm">{member.full_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm capitalize">{member.role || '—'}</td>
                    <td className="px-6 py-4 text-blue-400 text-xs font-medium">{member.ministry || '—'}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{member.phone || '—'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`border text-[10px] uppercase font-bold px-3 py-1 rounded-full ${STATUS_COLORS[member.status] || STATUS_COLORS.active}`}>
                        {member.status || 'active'}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4 text-right relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                        className="text-slate-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
                      >
                        <MoreVertical size={15} />
                      </button>
                      {openMenuId === member.id && (
                        <div className="absolute right-6 top-10 z-50 bg-[#1a1d2e] border border-slate-700 rounded-xl shadow-xl w-36 overflow-hidden">
                          <button
                            onClick={() => openEdit(member)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(member)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
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
          <div className="px-6 py-3 border-t border-slate-800/40 text-[10px] text-slate-600 uppercase tracking-widest">
            Showing {filtered.length} of {members.length} members
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-white">
                {editingMember ? "Edit Member" : "Add New Member"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Full Name" required>
                <input
                  type="text" name="full_name" value={form.full_name}
                  onChange={handleChange} required
                  placeholder="e.g. Juan dela Cruz"
                  className="input-style"
                />
              </Field>

              <Field label="Role">
                <select name="role" value={form.role} onChange={handleChange} className="input-style">
                  <option value="">Select a role</option>
                  <option value="pastor">Pastor</option>
                  <option value="leader">Leader</option>
                  <option value="member">Member</option>
                  <option value="volunteer">Volunteer</option>
                </select>
              </Field>

              <Field label="Ministry">
                <select name="ministry" value={form.ministry} onChange={handleChange} className="input-style">
                  <option value="">Select a ministry</option>
                  {MINISTRIES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>

              <Field label="Phone">
                <input
                  type="tel" name="phone" value={form.phone}
                  onChange={handleChange}
                  placeholder="e.g. 09XX XXX XXXX"
                  className="input-style"
                />
              </Field>

              <Field label="Status">
                <select name="status" value={form.status} onChange={handleChange} className="input-style">
                  <option value="active">Active</option>
                  <option value="busy">Busy</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-all">
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

      {/* Close dropdown on outside click */}
      {openMenuId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
      )}

      {/* Inline styles for form inputs */}
      <style jsx>{`
        .input-style {
          width: 100%;
          background: rgb(30 34 51 / 0.6);
          border: 1px solid rgb(100 116 139 / 0.3);
          color: white;
          border-radius: 0.75rem;
          padding: 0.625rem 1rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-style:focus {
          border-color: rgb(59 130 246);
        }
        .input-style::placeholder {
          color: rgb(100 116 139);
        }
        option {
          background: #1a1d2e;
          color: white;
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}