'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/app/lib/supabase";
import { useTheme } from "@/app/context/ThemeContext";
import {
  Calendar, Plus, Search, MoreHorizontal,
  CheckCircle2, CircleDot, X, Trash2, Pencil, CalendarDays, Sun, Moon
} from "lucide-react";

const EMPTY_FORM = {
  title: '',
  ministry: '',
  date: '',
  budget: '',
  status: 'planning',
  description: '',
  church_id: '',
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
const GLOBAL_ROLES = ["admin", "pastor"];

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
    divider:     dark ? "border-slate-800/50"  : "border-slate-300",
    filterInactive: dark ? "bg-[#1a1d2e] border-slate-800 text-slate-500 hover:text-slate-200" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
    modalBg:     dark ? "bg-[#1a1d2e]"        : "bg-slate-50",
    modalBorder: dark ? "border-slate-700"     : "border-slate-300",
    cancelBtn:   dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-300 hover:bg-slate-400 text-slate-900",
    emptyIcon:   dark ? "text-slate-700"       : "text-slate-400",
    menuBg:      dark ? "bg-[#1a1d2e] border-slate-700" : "bg-slate-50 border-slate-300",
    menuHover:   dark ? "hover:bg-slate-800"    : "hover:bg-slate-200",
    iconBtn:     dark ? "bg-[#1a1d2e] border-slate-800 text-slate-400 hover:text-white" : "bg-slate-50 border-slate-400 text-slate-600 hover:text-slate-900",
  };
}

// Accent color for content text — the -400 shades read fine on the dark bg
// but are too pale for contrast on light.
const ACCENT = {
  blue:    { dark: "text-blue-400",    light: "text-blue-600" },
  emerald: { dark: "text-emerald-400", light: "text-emerald-600" },
  orange:  { dark: "text-orange-400",  light: "text-orange-600" },
};
function A(dark, color) {
  return dark ? ACCENT[color].dark : ACCENT[color].light;
}

export default function EventsPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const t = T(dark);

  const [events, setEvents]         = useState([]);
  const [churches, setChurches]     = useState([]);
  const [profile, setProfile]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [search, setSearch]         = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [form, setForm]             = useState(EMPTY_FORM);

  const isGlobal = profile && GLOBAL_ROLES.includes(profile.role);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('role, church_id')
      .eq('id', user.id)
      .single();
    if (error) { console.error('Error fetching profile:', error.message); return null; }
    setProfile(data);
    return data;
  }

  async function fetchChurches() {
    const { data, error } = await supabase.from('churches').select('id, name').order('name', { ascending: true });
    if (error) { console.error('Error fetching churches:', error.message); return; }
    if (data) setChurches(data);
  }

  async function fetchEvents() {
    setLoading(true);
    const { data } = await supabase.from('events').select('*').order('date', { ascending: true });
    if (data) setEvents(data);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const p = await fetchProfile();
      await fetchChurches();
      await fetchEvents();
      if (p && !GLOBAL_ROLES.includes(p.role)) {
        setForm((f) => ({ ...f, church_id: p.church_id || '' }));
      }
    }
    init();
  }, []);

  function openAdd() {
    setEditingEvent(null);
    setForm({ ...EMPTY_FORM, church_id: isGlobal ? '' : (profile?.church_id || '') });
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
      church_id:   event.church_id   || '',
    });
    setShowModal(true);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isGlobal && !form.church_id) {
      alert('Please select which branch this event belongs to.');
      return;
    }
    setSaving(true);
    const payload = { ...form, budget: parseFloat(form.budget) || 0, church_id: isGlobal ? form.church_id : profile?.church_id };
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

  const churchName = (id) => churches.find((c) => c.id === id)?.name;

  const filtered = events.filter((ev) => {
    const matchSearch = ev.title?.toLowerCase().includes(search.toLowerCase()) || ev.ministry?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = activeFilter === "all" || ev.status === activeFilter;
    return matchSearch && matchFilter;
  });

  const counts = {
    total:    events.length,
    approved: events.filter((e) => e.status === "approved").length,
    pending:  events.filter((e) => e.status === "pending").length,
    done:     events.filter((e) => e.status === "done").length,
  };

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.pageBg} transition-colors duration-200`}>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.textMuted} mb-1`}>GGCF-GMI · Pandi, Bulacan</p>
          <h1 className={`text-2xl font-black ${t.textPrimary}`}>Events & Services</h1>
          <p className={`${t.textSub} text-sm mt-0.5`}>Schedule and track church activities and ministry projects</p>
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
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-blue-900/20 shrink-0"
          >
            <Plus size={16} /> Add Event
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Events", value: counts.total,    color: A(dark, "blue") },
          { label: "Approved",     value: counts.approved, color: A(dark, "emerald") },
          { label: "Pending",      value: counts.pending,  color: A(dark, "orange") },
          { label: "Completed",    value: counts.done,     color: t.textMuted },
        ].map((c) => (
          <div key={c.label} className={`${t.cardBg} border ${t.cardBorder} rounded-2xl px-5 py-4 backdrop-blur-sm`}>
            <p className={`text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1`}>{c.label}</p>
            <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-2.5 w-4 h-4 ${t.textSub}`} />
          <input
            type="text" placeholder="Search events or ministries..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl py-2 pl-9 pr-4 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${activeFilter === f ? "bg-blue-600 text-white" : t.filterInactive}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className={`${t.textMuted} text-center py-20 text-sm`}>Loading events...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <CalendarDays className={`w-8 h-8 ${t.emptyIcon} mx-auto mb-2`} />
          <p className={`${t.textMuted} text-sm`}>{search || activeFilter !== "all" ? "No events match your search." : "No events yet. Add one!"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} branchName={isGlobal ? churchName(event.church_id) : null} onEdit={openEdit} onDelete={handleDeleteLocal} t={t} dark={dark} />
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-lg font-black ${t.textPrimary}`}>{editingEvent ? "Edit Event" : "Add New Event"}</h2>
              <button onClick={() => setShowModal(false)} className={`${t.textSub} hover:text-blue-400 transition-colors`}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Event Title" required t={t}>
                <input type="text" name="title" value={form.title} onChange={handleChange} required placeholder="e.g. Youth Prayer Night" className={inputStyle(t)} />
              </Field>

              {isGlobal && (
                <Field label="Branch" required t={t}>
                  <select name="church_id" value={form.church_id} onChange={handleChange} className={inputStyle(t)}>
                    <option value="">Select a branch</option>
                    {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}

              <Field label="Ministry" t={t}>
                <select name="ministry" value={form.ministry} onChange={handleChange} className={inputStyle(t)}>
                  <option value="">Select a ministry</option>
                  {MINISTRIES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>

              <Field label="Date" t={t}>
                <input type="date" name="date" value={form.date} onChange={handleChange} className={inputStyle(t)} />
              </Field>

              <Field label="Budget (₱)" t={t}>
                <input type="number" name="budget" value={form.budget} onChange={handleChange} placeholder="e.g. 3000" min="0" className={inputStyle(t)} onWheel={(e) => e.target.blur()} />
              </Field>

              <Field label="Status" t={t}>
                <select name="status" value={form.status} onChange={handleChange} className={inputStyle(t)}>
                  <option value="planning">Planning</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="done">Done</option>
                </select>
              </Field>

              <Field label="Description" t={t}>
                <textarea name="description" value={form.description} onChange={handleChange} placeholder="Optional notes about this event..." rows={3} className={`${inputStyle(t)} resize-none`} />
              </Field>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className={`flex-1 ${t.cancelBtn} rounded-xl py-2.5 text-sm font-semibold transition-all`}>Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition-all">
                  {saving ? 'Saving...' : editingEvent ? 'Save Changes' : 'Add Event'}
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

function EventCard({ event, branchName, onEdit, onDelete, t, dark }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const phase = event.status || "planning";

  async function handleDelete() {
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    setDeleting(true);
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (error) { alert('Error deleting event: ' + error.message); setDeleting(false); }
    else onDelete(event.id);
  }

  const steps = [
    { key: "planning", label: "Planning", Icon: CircleDot },
    { key: "approved", label: "Approved", Icon: CircleDot },
    { key: "done",     label: "Done",     Icon: CheckCircle2 },
  ];
  const stepIndex = ["planning", "pending", "approved", "done"].indexOf(phase);

  return (
    <div className={`${t.cardBg} border ${t.cardBorder} p-6 rounded-3xl backdrop-blur-sm hover:border-blue-500/40 transition-all group relative`}>
      <div className="flex justify-between items-start mb-4">
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[phase] || STATUS_COLORS.planning}`}>{phase}</span>
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className={`${t.textMuted} hover:text-blue-400 transition-colors p-1 rounded-lg ${t.menuHover}`}><MoreHorizontal size={16} /></button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className={`absolute right-0 top-8 z-20 ${t.menuBg} border rounded-xl shadow-xl w-36 overflow-hidden`}>
                <button onClick={() => { setMenuOpen(false); onEdit(event); }} className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textSub} ${t.menuHover} transition-colors`}><Pencil size={13} /> Edit</button>
                <button onClick={() => { setMenuOpen(false); handleDelete(); }} disabled={deleting} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"><Trash2 size={13} /> {deleting ? 'Deleting...' : 'Delete'}</button>
              </div>
            </>
          )}
        </div>
      </div>

      <h3 className={`text-base font-black ${t.textPrimary} mb-1 group-hover:text-blue-400 transition-colors leading-snug`}>{event.title}</h3>
      <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-1">{event.ministry || 'No ministry assigned'}</p>
      {branchName ? <p className={`${t.textMuted} text-[10px] font-bold uppercase tracking-wider mb-4`}>{branchName}</p> : <div className="mb-4" />}

      <div className="space-y-2 mb-6">
        <div className={`flex items-center gap-2 ${t.textSub}`}>
          <Calendar size={13} className={`${t.textMuted} shrink-0`} />
          <span className="text-xs">{event.date ? new Date(event.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No date set'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold ${t.textMuted} uppercase tracking-widest`}>Budget</span>
          <span className={`text-xs font-mono ${t.textPrimary}`}>₱{Number(event.budget || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
        </div>
        {event.description && <p className={`text-xs ${t.textMuted} leading-relaxed line-clamp-2`}>{event.description}</p>}
      </div>

      <div className={`pt-4 border-t ${t.divider}`}>
        <div className="flex items-center justify-between">
          {steps.map((step, i) => {
            const reached = stepIndex >= ["planning", "pending", "approved", "done"].indexOf(step.key === "approved" ? "approved" : step.key);
            return (
              <div key={step.key} className="flex items-center gap-1">
                <step.Icon size={12} className={reached ? (step.key === "done" ? A(dark, "emerald") : A(dark, "blue")) : (dark ? "text-slate-700" : "text-slate-400")} />
                <span className={`text-[9px] font-bold uppercase tracking-wider ${reached ? t.textSub : t.emptyIcon}`}>{step.label}</span>
                {i < steps.length - 1 && <div className={`w-6 h-px mx-1 ${stepIndex > i ? "bg-blue-500/40" : (dark ? "bg-slate-800" : "bg-slate-300")}`} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, t, children }) {
  return (
    <div>
      <label className={`block text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1.5`}>{label} {required && <span className="text-red-400">*</span>}</label>
      {children}
    </div>
  );
}