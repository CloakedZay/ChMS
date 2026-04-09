'use client';
import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabase";
import {
  Calendar,
  Plus,
  Search,
  MoreHorizontal,
  CheckCircle2,
  CircleDot,
  X,
} from "lucide-react";

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    ministry: '',
    date: '',
    budget: '',
    status: 'planning',
    description: '',
  });

  async function getEvents() {
    const { data } = await supabase.from('events').select('*').order('date', { ascending: true });
    if (data) setEvents(data);
    setLoading(false);
  }

  useEffect(() => {
    async function fetchEvents() {
      const { data } = await supabase.from('events').select('*').order('date', { ascending: true });
      if (data) setEvents(data);
      setLoading(false);
    }
    fetchEvents();
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase.from('events').insert([{
      ...form,
      budget: parseFloat(form.budget) || 0,
    }]);

    if (error) {
      alert('Error saving event: ' + error.message);
    } else {
      setShowModal(false);
      setForm({ title: '', ministry: '', date: '', budget: '', status: 'planning', description: '' });
      await getEvents();
    }

    setSaving(false);
  }

  return (
    <div className="p-10">
      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Event & Ministry Coordination
          </h1>
          <p className="text-slate-500 text-sm mt-1">Schedule and track church activities</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-blue-900/20 active:scale-95"
        >
          <Plus size={20} />
          Add Event / Project
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-3 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search events or ministries..."
            className="w-full bg-[#161925]/50 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 transition-all"
          />
        </div>
        <div className="flex bg-[#161925]/50 p-1 rounded-2xl border border-slate-800">
          <button className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md">Upcoming</button>
          <button className="px-6 py-2 text-slate-500 hover:text-white rounded-xl text-sm font-bold transition-colors">Past Events</button>
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <p className="text-slate-500 text-center py-20">Loading events...</p>
      ) : events.length === 0 ? (
        <p className="text-slate-500 text-center py-20">No events yet. Add one!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Add Event Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Add New Event</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">
                  Event Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Youth Prayer Night"
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Ministry</label>
                <select
                  name="ministry"
                  value={form.ministry}
                  onChange={handleChange}
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select a ministry</option>
                  <option value="Training & Life Group">Training & Life Group</option>
                  <option value="Mission & Evangelism">Mission & Evangelism</option>
                  <option value="Program & Music">Program & Music</option>
                  <option value="Youth Ministry">Youth Ministry</option>
                  <option value="Children's Ministry">Children's Ministry</option>
                  <option value="Prayer Ministry">Prayer Ministry</option>
                  <option value="Media & Communications">Media & Communications</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Date</label>
                <input
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Budget (₱)</label>
                <input
                  type="number"
                  name="budget"
                  value={form.budget}
                  onChange={handleChange}
                  placeholder="e.g. 3000"
                  min="0"
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Status</label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="planning">Planning</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="done">Done</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-1">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Optional notes about this event..."
                  rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-600 resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 text-sm font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition-all"
                >
                  {saving ? 'Saving...' : 'Save Event'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({ event, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
 
  const statusColors = {
    approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    pending: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    planning: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    done: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };
 
  const phase = event.status;
 
  async function handleDelete() {
    const confirmed = window.confirm(`Delete "${event.title}"?`);
    if (!confirmed) return;
 
    setDeleting(true);
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (error) {
      alert('Error deleting event: ' + error.message);
      setDeleting(false);
    } else {
      onDelete(event.id); // Remove from UI instantly
    }
  }
 
  return (
    <div className="bg-[#161925]/50 border border-slate-800/60 p-6 rounded-3xl backdrop-blur-sm hover:border-slate-700 transition-all group relative">
      <div className="flex justify-between items-start mb-4">
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusColors[phase] || statusColors.planning}`}>
          {event.status}
        </span>
 
        {/* ··· Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-slate-600 hover:text-white transition-colors"
          >
            <MoreHorizontal size={20} />
          </button>
 
          {menuOpen && (
            <div className="absolute right-0 top-7 z-10 bg-[#1a1d2e] border border-slate-700 rounded-xl shadow-xl w-36 overflow-hidden">
              <button
                onClick={() => { setMenuOpen(false); handleDelete(); }}
                disabled={deleting}
                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : '🗑 Delete Event'}
              </button>
            </div>
          )}
        </div>
      </div>
 
      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
        {event.title}
      </h3>
 
      <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-6">
        {event.ministry}
      </p>
 
      <div className="space-y-3 mb-8">
        <div className="flex items-center gap-3 text-slate-400">
          <Calendar size={16} className="text-slate-600" />
          <span className="text-sm">
            {event.date
              ? new Date(event.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : 'No date set'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Budget:</span>
          <span className="text-sm font-mono text-slate-200">
            ₱{Number(event.budget).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
 
      {/* Progress Timeline */}
      <div className="pt-6 border-t border-slate-800/50 flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <div className={`w-2 h-2 rounded-full ${phase === 'planning' ? 'bg-blue-500 animate-pulse' : 'bg-slate-700'}`}></div>
          <span className="text-[10px] font-bold text-slate-500 uppercase">Planning</span>
        </div>
        <div className="w-8 h-[2px] bg-slate-800"></div>
        <div className={`flex gap-2 items-center ${phase === 'approved' || phase === 'pending' ? 'text-orange-400' : 'text-slate-700'}`}>
          <CircleDot size={12} />
          <span className="text-[10px] font-bold uppercase">Approved</span>
        </div>
        <div className="w-8 h-[2px] bg-slate-800"></div>
        <div className={`flex gap-2 items-center ${phase === 'done' ? 'text-emerald-400' : 'text-slate-700'}`}>
          <CheckCircle2 size={12} />
          <span className="text-[10px] font-bold uppercase">Done</span>
        </div>
      </div>
    </div>
  );
}