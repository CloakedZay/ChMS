'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabase";
import {
  Calendar, Plus, Search, MoreHorizontal,
  CheckCircle2, CircleDot, X, Trash2, Pencil, CalendarDays
} from "lucide-react";

const EMPTY_FORM = {
  title: '',
  ministry: '',
  date: '',
  budget: '',
  status: 'planning',
  description: '',
};

const MINISTRIES = [
  "Program & Music Ministry",
  "Mission & Evangelism",
  "Training & Life Ministry",
  "Building & Equipment",
  "Finance Ministry",
];

const STATUS_COLORS = {
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  pending:  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  planning: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  done:     "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const FILTERS = ["all", "planning", "pending", "approved", "done"];

export default function EventsPage() {
  const [events, setEvents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [search, setSearch]         = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [form, setForm]             = useState(EMPTY_FORM);

  // ── Data ──────────────────────────────────────────────────────────────────

  async function fetchEvents() {
    setLoading(true);
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });
    if (data) setEvents(data);
    setLoading(false);
  }

  useEffect(() => { fetchEvents(); }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingEvent(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(event) {
    setEditingEvent(event);
    setForm({
      title:       event.title       || '',
      ministry:    event.ministry    || '',
      date:        event.date        || '',
      budget:      event.budget      || '',
      status:      event.status      || 'planning',
      description: event.description || '',
    });
    setShowModal(true);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    const payload = { ...form, budget: parseFloat(form.budget) || 0 };

    if (editingEvent) {
      const { error } = await supabase.from('events').update(payload).eq('id', editingEvent.id);
      if (error) alert('Error updating event: ' + error.message);
    } else {
      const { error } = await supabase.from('events').insert([payload]);
      if (error) alert('Error saving event: ' + error.message);
    }

    setSaving(false);
    setShowModal(false);
    setEditingEvent(null);
    setForm(EMPTY_FORM);
    await fetchEvents();
  }

  function handleDeleteLocal(id) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = events.filter((ev) => {
    const matchSearch =
      ev.title?.toLowerCase().includes(search.toLowerCase()) ||
      ev.ministry?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = activeFilter === "all" || ev.status === activeFilter;
    return matchSearch && matchFilter;
  });

  // ── Summary counts ────────────────────────────────────────────────────────

  const counts = {
    total:    events.length,
    approved: events.filter((e) => e.status === "approved").length,
    pending:  events.filter((e) => e.status === "pending").length,
    done:     events.filter((e) => e.status === "done").length,
  };

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 min-h-screen bg-[#0f111a]">

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
          <h1 className="text-2xl font-black text-white">Events & Services</h1>
          <p className="text-slate-500 text-sm mt-0.5">Schedule and track church activities and ministry projects</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} />
          Add Event
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Events", value: counts.total,    color: "text-white" },
          { label: "Approved",     value: counts.approved, color: "text-emerald-400" },
          { label: "Pending",      value: counts.pending,  color: "text-orange-400" },
          { label: "Completed",    value: counts.done,     color: "text-slate-400" },
        ].map((c) => (
          <div key={c.label} className="bg-[#1a1d2e]/50 border border-slate-800/60 rounded-2xl px-5 py-4 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{c.label}</p>
            <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search events or ministries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1a1d2e] border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                activeFilter === f
                  ? "bg-blue-600 text-white"
                  : "bg-[#1a1d2e] border border-slate-800 text-slate-500 hover:text-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <p className="text-slate-500 text-center py-20 text-sm">Loading events...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <CalendarDays className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">
            {search || activeFilter !== "all" ? "No events match your search." : "No events yet. Add one!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onEdit={openEdit}
              onDelete={handleDeleteLocal}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-white">
                {editingEvent ? "Edit Event" : "Add New Event"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Event Title" required>
                <input type="text" name="title" value={form.title} onChange={handleChange}
                  required placeholder="e.g. Youth Prayer Night" className="input-style" />
              </Field>

              <Field label="Ministry">
                <select name="ministry" value={form.ministry} onChange={handleChange} className="input-style">
                  <option value="">Select a ministry</option>
                  {MINISTRIES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>

              <Field label="Date">
                <input type="date" name="date" value={form.date} onChange={handleChange} className="input-style" />
              </Field>

              <Field label="Budget (₱)">
                <input type="number" name="budget" value={form.budget} onChange={handleChange}
                  placeholder="e.g. 3000" min="0" className="input-style" onWheel={(e) => e.target.blur()} />
              </Field>

              <Field label="Status">
                <select name="status" value={form.status} onChange={handleChange} className="input-style">
                  <option value="planning">Planning</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="done">Done</option>
                </select>
              </Field>

              <Field label="Description">
                <textarea name="description" value={form.description} onChange={handleChange}
                  placeholder="Optional notes about this event..." rows={3}
                  className="input-style resize-none" />
              </Field>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                  {saving ? 'Saving...' : editingEvent ? 'Save Changes' : 'Add Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
        .input-style:focus { border-color: rgb(59 130 246); }
        .input-style::placeholder { color: rgb(100 116 139); }
        option { background: #1a1d2e; color: white; }
      `}</style>
    </div>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const phase = event.status || "planning";

  async function handleDelete() {
    const confirmed = window.confirm(`Delete "${event.title}"?`);
    if (!confirmed) return;
    setDeleting(true);
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (error) {
      alert('Error deleting event: ' + error.message);
      setDeleting(false);
    } else {
      onDelete(event.id);
    }
  }

  const steps = [
    { key: "planning", label: "Planning",  Icon: CircleDot },
    { key: "approved", label: "Approved",  Icon: CircleDot },
    { key: "done",     label: "Done",      Icon: CheckCircle2 },
  ];

  const stepIndex = ["planning", "pending", "approved", "done"].indexOf(phase);

  return (
    <div className="bg-[#1a1d2e]/50 border border-slate-800/60 p-6 rounded-3xl backdrop-blur-sm hover:border-slate-700 transition-all group relative">

      {/* Top Row */}
      <div className="flex justify-between items-start mb-4">
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[phase] || STATUS_COLORS.planning}`}>
          {phase}
        </span>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-slate-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 bg-[#1a1d2e] border border-slate-700 rounded-xl shadow-xl w-36 overflow-hidden">
                <button
                  onClick={() => { setMenuOpen(false); onEdit(event); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); handleDelete(); }}
                  disabled={deleting}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={13} /> {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Title & Ministry */}
      <h3 className="text-base font-black text-white mb-1 group-hover:text-blue-400 transition-colors leading-snug">
        {event.title}
      </h3>
      <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-5">
        {event.ministry || 'No ministry assigned'}
      </p>

      {/* Details */}
      <div className="space-y-2 mb-6">
        <div className="flex items-center gap-2 text-slate-400">
          <Calendar size={13} className="text-slate-600 shrink-0" />
          <span className="text-xs">
            {event.date
              ? new Date(event.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
              : 'No date set'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Budget</span>
          <span className="text-xs font-mono text-slate-200">
            ₱{Number(event.budget || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
        </div>
        {event.description && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{event.description}</p>
        )}
      </div>

      {/* Progress Timeline */}
      <div className="pt-4 border-t border-slate-800/50">
        <div className="flex items-center justify-between">
          {steps.map((step, i) => {
            const reached = stepIndex >= ["planning", "pending", "approved", "done"].indexOf(step.key === "approved" ? "approved" : step.key);
            return (
              <div key={step.key} className="flex items-center gap-1">
                <step.Icon
                  size={12}
                  className={reached ? (step.key === "done" ? "text-emerald-400" : "text-blue-400") : "text-slate-700"}
                />
                <span className={`text-[9px] font-bold uppercase tracking-wider ${reached ? "text-slate-400" : "text-slate-700"}`}>
                  {step.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={`w-6 h-px mx-1 ${stepIndex > i ? "bg-blue-500/40" : "bg-slate-800"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
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