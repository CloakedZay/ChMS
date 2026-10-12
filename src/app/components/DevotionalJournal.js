'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookHeart, Plus, Search, X, Pencil, Trash2, BookOpen, HandHeart, Loader2 } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import ScriptureLink from '@/app/components/ScriptureLink';

// Devotional journal (db/027). Private: every person reads and writes only
// their own entries; the database enforces it. Used by both dashboards.

const todayManila = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()); // YYYY-MM-DD

const EMPTY = () => ({ entry_date: todayManila(), scripture: '', title: '', reflection: '', prayer: '' });

function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function DevotionalJournal() {
  const { user } = useAuth();
  const { dark } = useTheme();

  const [entries, setEntries] = useState(null);   // null = loading
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);   // null = closed, {} = new, entry = edit
  const [form, setForm] = useState(EMPTY());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const t = dark
    ? {
        page: 'bg-[#111815] text-slate-100', card: 'bg-[#1b2420] border-slate-800/60', text: 'text-white',
        sub: 'text-slate-400', muted: 'text-slate-500', input: 'bg-[#111815] border-slate-700 text-slate-100 placeholder:text-slate-500',
        ghost: 'border-slate-700 text-slate-300 hover:bg-white/5', divider: 'border-slate-800', chip: 'bg-blue-500/15 text-blue-300',
        modal: 'bg-[#1b2420] border-slate-800',
      }
    : {
        page: 'bg-[#f8f7f2] text-[#252a28]', card: 'bg-white border-[#e5e3d8]', text: 'text-[#173f35]',
        sub: 'text-[#4c534f]', muted: 'text-[#858b87]', input: 'bg-white border-[#d9d6c8] text-[#252a28] placeholder:text-[#858b87]',
        ghost: 'border-[#d9d6c8] text-[#4c534f] hover:bg-[#f8f7f2]', divider: 'border-[#efede4]', chip: 'bg-[#e8f0ea] text-[#173f35]',
        modal: 'bg-white border-[#e5e3d8]',
      };

  async function load() {
    const { data, error } = await supabase
      .from('devotional_journal')
      .select('id, entry_date, scripture, title, reflection, prayer, created_at')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(/does not exist|schema cache/i.test(error.message)
        ? 'The journal has not been set up yet. Ask the administrator to run db/027_devotional_journal.sql.'
        : error.message);
      setEntries([]);
      return;
    }
    setLoadError('');
    setEntries(data || []);
  }

  useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !entries) return entries || [];
    return entries.filter((e) =>
      [e.title, e.scripture, e.reflection, e.prayer].some((v) => (v || '').toLowerCase().includes(q)));
  }, [entries, search]);

  function openNew() { setForm(EMPTY()); setFormError(''); setEditing({}); }
  function openEdit(e) {
    setForm({
      entry_date: e.entry_date || todayManila(), scripture: e.scripture || '', title: e.title || '',
      reflection: e.reflection || '', prayer: e.prayer || '',
    });
    setFormError('');
    setEditing(e);
  }
  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const clean = {
      entry_date: form.entry_date || todayManila(),
      scripture: form.scripture.trim() || null,
      title: form.title.trim() || null,
      reflection: form.reflection.trim() || null,
      prayer: form.prayer.trim() || null,
    };
    if (!clean.scripture && !clean.title && !clean.reflection && !clean.prayer) {
      setFormError('Write something first — a verse, a title, a reflection or a prayer.');
      return;
    }
    setSaving(true);
    setFormError('');
    const { error } = editing?.id
      ? await supabase.from('devotional_journal').update(clean).eq('id', editing.id)
      : await supabase.from('devotional_journal').insert([clean]);
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setEditing(null);
    load();
  }

  async function remove(entry) {
    if (!window.confirm(`Delete this entry${entry.title ? ` — "${entry.title}"` : ''}? This cannot be undone.`)) return;
    const { error } = await supabase.from('devotional_journal').delete().eq('id', entry.id);
    if (error) { alert('Could not delete: ' + error.message); return; }
    setEntries((list) => list.filter((x) => x.id !== entry.id));
  }

  const label = `block text-xs font-semibold mb-1.5 ${t.sub}`;
  const field = `w-full border rounded-xl px-4 py-2.5 text-sm ${t.input}`;

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.page}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className={`text-2xl font-black ${t.text}`}>Devotional Journal</h1>
          <p className={`text-sm mt-1 ${t.sub}`}>
            A private place for your time with God. Only you can read your entries.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-5 h-10 rounded-xl shadow-sm"
        >
          <Plus size={16} strokeWidth={2} /> New entry
        </button>
      </div>

      {loadError && (
        <p className="mb-6 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{loadError}</p>
      )}

      {entries && entries.length > 0 && (
        <div className="relative max-w-md mb-6">
          <Search size={16} className={`absolute left-3.5 top-3 ${t.muted}`} />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your entries..."
            aria-label="Search your entries"
            className={`w-full border rounded-full pl-10 pr-4 py-2 text-sm ${t.input}`}
          />
        </div>
      )}

      {/* List */}
      {entries === null ? (
        <div className="space-y-4 max-w-3xl">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-32 w-full rounded-3xl" />)}
        </div>
      ) : entries.length === 0 && !loadError ? (
        <div className={`max-w-xl border border-dashed rounded-3xl p-10 text-center ${t.card}`}>
          <span className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${t.chip}`}>
            <BookHeart size={26} strokeWidth={1.5} />
          </span>
          <h2 className={`font-bold ${t.text}`}>Start your first entry</h2>
          <p className={`text-sm mt-1 mb-5 ${t.sub}`}>Note the verse you read, what stood out to you, and what you want to pray about.</p>
          <button onClick={openNew} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-5 h-10 rounded-xl">
            <Plus size={16} /> Write an entry
          </button>
        </div>
      ) : shown.length === 0 && entries.length > 0 ? (
        <p className={`text-sm ${t.muted}`}>No entries match &ldquo;{search}&rdquo;.</p>
      ) : (
        <ol className="space-y-4 max-w-3xl">
          {shown.map((e) => (
            <li key={e.id} className={`border rounded-3xl p-6 ${t.card}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${t.muted}`}>{formatDate(e.entry_date)}</p>
                  {e.title && <h2 className={`text-lg font-bold mt-1 ${t.text}`}>{e.title}</h2>}
                  {e.scripture && (
                    <span className={`inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-2.5 py-1 rounded-full ${t.chip}`}>
                      <BookOpen size={12} strokeWidth={2} />
                      <ScriptureLink reference={e.scripture} className="font-semibold" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(e)} aria-label="Edit entry" title="Edit"
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:text-blue-500 hover:bg-blue-500/10`}>
                    <Pencil size={15} strokeWidth={1.75} />
                  </button>
                  <button onClick={() => remove(e)} aria-label="Delete entry" title="Delete"
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:text-rose-500 hover:bg-rose-500/10`}>
                    <Trash2 size={15} strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              {e.reflection && (
                <div className="mt-4">
                  <p className={`text-xs font-semibold mb-1 ${t.muted}`}>Reflection</p>
                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${t.sub}`}>{e.reflection}</p>
                </div>
              )}
              {e.prayer && (
                <div className={`mt-4 pt-4 border-t ${t.divider}`}>
                  <p className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${t.muted}`}><HandHeart size={13} strokeWidth={1.75} /> Prayer</p>
                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${t.sub}`}>{e.prayer}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Entry form */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-[#0c1311]/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}
        >
          <form
            onSubmit={save}
            role="dialog" aria-modal="true" aria-label={editing.id ? 'Edit entry' : 'New entry'}
            className={`w-full sm:max-w-xl max-h-[92vh] overflow-y-auto border rounded-t-3xl sm:rounded-3xl p-6 shadow-xl ${t.modal}`}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className={`text-lg font-bold ${t.text}`}>{editing.id ? 'Edit entry' : 'New entry'}</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close"
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:bg-black/5`}>
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="j-date">Date</label>
                  <input id="j-date" type="date" name="entry_date" value={form.entry_date} onChange={change} required className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="j-verse">Scripture</label>
                  <input id="j-verse" type="text" name="scripture" value={form.scripture} onChange={change} placeholder="e.g. John 3:16-21" className={field} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="j-title">Title</label>
                <input id="j-title" type="text" name="title" value={form.title} onChange={change} placeholder="Optional" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="j-ref">Reflection</label>
                <textarea id="j-ref" name="reflection" rows={5} value={form.reflection} onChange={change}
                  placeholder="What stood out to you? What is God saying?" className={`${field} resize-y`} />
              </div>
              <div>
                <label className={label} htmlFor="j-prayer">Prayer</label>
                <textarea id="j-prayer" name="prayer" rows={3} value={form.prayer} onChange={change}
                  placeholder="Write your prayer" className={`${field} resize-y`} />
              </div>

              {formError && (
                <p className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{formError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditing(null)} disabled={saving}
                  className={`flex-1 border rounded-xl h-11 text-sm font-semibold disabled:opacity-50 ${t.ghost}`}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl h-11 text-sm font-semibold">
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  {saving ? 'Saving...' : editing.id ? 'Save changes' : 'Save entry'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
