'use client';
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { UserPlus, MoreVertical, X, Trash2 } from "lucide-react";

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [form, setForm] = useState({
    full_name: '',
    role: '',
    ministry: '',
    status: '',
    phone: '',
  });

  async function getMembers() {
    const { data } = await supabase.from('members').select('*');
    if (data) setMembers(data);
    setLoading(false);
  }

  useEffect(() => {
    async function fetchMembers() {
      const { data } = await supabase.from('members').select('*');
      if (data) setMembers(data);
      setLoading(false);
    }
    fetchMembers();
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('members').insert([form]);
    if (error) {
      alert('Error saving member: ' + error.message);
    } else {
      setShowModal(false);
      setForm({ full_name: '', role: '', ministry: '', status: '', phone: '' });
      await getMembers();
    }
    setSaving(false);
  }

  async function handleDelete(member) {
    const confirmed = window.confirm(`Delete "${member.full_name}"?`);
    if (!confirmed) return;
    setOpenMenuId(null);
    const { error } = await supabase.from('members').delete().eq('id', member.id);
    if (error) {
      alert('Error deleting member: ' + error.message);
    } else {
      setMembers(members.filter(m => m.id !== member.id));
    }
  }

  const statusColors = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    busy: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    inactive: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Member Database</h1>
          <p className="text-slate-400 text-sm">GGCF-GMI Congregation Records</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold transition-all"
        >
          <UserPlus size={18} />
          Add Member
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-3xl overflow-visible backdrop-blur-sm">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/50 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Ministry</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    Loading congregation data...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    No members yet. Add one!
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="hover:bg-blue-500/5 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white">{member.full_name}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{member.role}</td>
                    <td className="px-6 py-4 text-blue-400 text-xs font-medium">{member.ministry}</td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{member.phone || '—'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`border text-[10px] uppercase font-bold px-3 py-1 rounded-full ${statusColors[member.status] || statusColors.active}`}>
                        {member.status || 'active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                        className="text-slate-600 hover:text-white transition-colors"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {/* Dropdown Menu */}
                      {openMenuId === member.id && (
                        <div className="fixed right-8 z-50 bg-[#1a1d2e] border border-slate-700 rounded-xl shadow-xl w-36 overflow-hidden">
                          <button
                            onClick={() => handleDelete(member)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={14} />
                            Delete
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
      </div>

      {/* Add Member Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Add New Member</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Juan dela Cruz"
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Role</label>
                <select name="role" value={form.role} onChange={handleChange}
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Select a role</option>
                  <option value="admin">Admin</option>
                  <option value="pastor">Pastor</option>
                  <option value="leader">Leader</option>
                  <option value="member">Member</option>
                  <option value="volunteer">Volunteer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Ministry</label>
                <input
                  type="text"
                  name="ministry"
                  value={form.ministry}
                  onChange={handleChange}
                  placeholder="e.g. Worship, Youth, Media"
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="e.g. 09XX XXX XXXX"
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Status</label>
                <select name="status" value={form.status} onChange={handleChange}
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Select status</option>
                  <option value="active">Active</option>
                  <option value="busy">Busy</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 text-sm font-semibold transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                  {saving ? 'Saving...' : 'Save Member'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Close menu when clicking outside */}
      {openMenuId && (
  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
)}
    </div>
  );
}