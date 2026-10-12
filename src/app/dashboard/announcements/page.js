'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Plus, Pin, PinOff, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { can } from '@/app/lib/permissions';
import BranchLabel from '@/app/components/BranchLabel';
import { todayManila, postedLabel } from '@/app/components/AnnouncementsBanner';

// Announcements (db/031). Pastor: any branch or all branches. Leader: own
// branch. Everyone else who opens this page can only read. The database
// enforces the same rules.

const EMPTY = { title: '', body: '', church_id: '', is_pinned: false, expires_on: '' };

export default function AnnouncementsPage() {
  const { user, role } = useAuth();
  const { dark } = useTheme();
  const canEdit = can(role, 'announcements', 'edit');
  const isPastor = role === 'pastor';

  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [branches, setBranches] = useState([]);
  const [myChurch, setMyChurch] = useState(null);
  const [editing, setEditing] = useState(null);   // null | {} new | row
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const t = dark
    ? { page: 'bg-[#111815]', card: 'bg-[#1b2420] border-slate-800/60', text: 'text-white', sub: 'text-slate-400', muted: 'text-slate-500',
        input: 'bg-[#111815] border-slate-700 text-slate-100 placeholder:text-slate-500', ghost: 'border-slate-700 text-slate-300 hover:bg-white/5',
        chip: 'bg-white/5 text-slate-300', modal: 'bg-[#1b2420] border-slate-800' }
    : { page: 'bg-[#f8f7f2]', card: 'bg-white border-[#e5e3d8]', text: 'text-[#173f35]', sub: 'text-[#4c534f]', muted: 'text-[#858b87]',
        input: 'bg-white border-[#d9d6c8] text-[#252a28] placeholder:text-[#858b87]', ghost: 'border-[#d9d6c8] text-[#4c534f] hover:bg-[#f8f7f2]',
        chip: 'bg-[#f1efe7] text-[#4c534f]', modal: 'bg-white border-[#e5e3d8]' };

  async function load() {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, church_id, title, body, is_pinned, expires_on, created_at')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(/does not exist|schema cache/i.test(error.message)
        ? 'Announcements have not been set up yet. Ask the administrator to run db/031_announcements.sql.'
        : error.message);
      setItems([]);
      return;
    }
    setLoadError('');
    setItems(data || []);
  }

  useEffect(() => {
    if (!user) return;
    load();
    supabase.from('churches').select('id, name').order('name').then(({ data }) => setBranches(data || []));
    supabase.from('profiles').select('church_id').eq('id', user.id).maybeSingle()
      .then(({ data }) => setMyChurch(data?.church_id || null));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const branchName = (id) => (id ? branches.find((b) => b.id === id)?.name || 'One branch' : 'All branches');
  const today = todayManila();

  function openNew() {
    setForm({ ...EMPTY, church_id: isPastor ? '' : myChurch || '' });
    setFormError('');
    setEditing({});
  }
  function openEdit(a) {
    setForm({ title: a.title, body: a.body || '', church_id: a.church_id || '', is_pinned: a.is_pinned, expires_on: a.expires_on || '' });
    setFormError('');
    setEditing(a);
  }
  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim()) { setFormError('Give the announcement a title.'); return; }
    if (!isPastor && !myChurch) { setFormError('Your account has no branch, so you can’t post. Ask the admin to set your branch.'); return; }
    const row = {
      title: form.title.trim(),
      body: form.body.trim() || null,
      church_id: isPastor ? form.church_id || null : myChurch,
      is_pinned: form.is_pinned,
      expires_on: form.expires_on || null,
    };
    setSaving(true);
    setFormError('');
    const { error } = editing?.id
      ? await supabase.from('announcements').update(row).eq('id', editing.id)
      : await supabase.from('announcements').insert([row]);
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setEditing(null);
    load();
  }

  async function togglePin(a) {
    const { error } = await supabase.from('announcements').update({ is_pinned: !a.is_pinned }).eq('id', a.id);
    if (error) alert(error.message); else load();
  }

  async function remove(a) {
    if (!window.confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('announcements').delete().eq('id', a.id);
    if (error) alert(error.message); else setItems((list) => list.filter((x) => x.id !== a.id));
  }

  const label = `block text-xs font-semibold mb-1.5 ${t.sub}`;
  const field = `w-full border rounded-xl px-4 py-2.5 text-sm ${t.input}`;

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${t.page}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${t.muted} mb-1`}><BranchLabel /></p>
          <h1 className={`text-2xl font-black ${t.text}`}>Announcements</h1>
          <p className={`text-sm mt-1 ${t.sub}`}>
            Shown at the top of everyone&apos;s overview. Pinned ones stay first.
            {canEdit && (isPastor ? ' You can post to one branch or all branches.' : ' You can post to your own branch.')}
          </p>
        </div>
        {canEdit && (
          <button onClick={openNew}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-5 h-10 rounded-xl shadow-sm">
            <Plus size={16} strokeWidth={2} /> New announcement
          </button>
        )}
      </div>

      {loadError && <p className="mb-6 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{loadError}</p>}

      {items === null ? (
        <div className="space-y-4 max-w-3xl">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 w-full rounded-3xl" />)}</div>
      ) : items.length === 0 && !loadError ? (
        <div className={`max-w-xl border border-dashed rounded-3xl p-10 text-center ${t.card}`}>
          <span className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-[#c5a66a]/15 text-[#9c7f45]">
            <Megaphone size={26} strokeWidth={1.5} />
          </span>
          <h2 className={`font-bold ${t.text}`}>No announcements yet</h2>
          <p className={`text-sm mt-1 ${t.sub}`}>
            {canEdit ? 'Post one and it appears at the top of everyone’s overview.' : 'Announcements from your pastor and leaders will appear here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-4 max-w-3xl">
          {items.map((a) => {
            const expired = a.expires_on && a.expires_on < today;
            return (
              <li key={a.id} className={`relative overflow-hidden border rounded-3xl p-6 ${t.card} ${expired ? 'opacity-60' : ''}`}>
                {a.is_pinned && <span className="absolute inset-y-0 left-0 w-1.5 bg-[#c5a66a]" aria-hidden="true" />}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {a.is_pinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#c5a66a]/20 text-[#9c7f45]"><Pin size={11} /> Pinned</span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.chip}`}>{branchName(a.church_id)}</span>
                      {expired
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500">Expired</span>
                        : a.expires_on && <span className={`text-[10px] ${t.muted}`}>Until {postedLabel(a.expires_on + 'T00:00:00+08:00')}</span>}
                    </div>
                    <h2 className={`text-base font-bold ${t.text}`}>{a.title}</h2>
                    <p className={`text-[11px] mt-0.5 ${t.muted}`}>Posted {postedLabel(a.created_at)}</p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => togglePin(a)} title={a.is_pinned ? 'Unpin' : 'Pin to top'} aria-label={a.is_pinned ? 'Unpin' : 'Pin to top'}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:text-[#c5a66a] hover:bg-[#c5a66a]/10`}>
                        {a.is_pinned ? <PinOff size={15} strokeWidth={1.75} /> : <Pin size={15} strokeWidth={1.75} />}
                      </button>
                      <button onClick={() => openEdit(a)} title="Edit" aria-label="Edit"
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:text-blue-500 hover:bg-blue-500/10`}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button onClick={() => remove(a)} title="Delete" aria-label="Delete"
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:text-rose-500 hover:bg-rose-500/10`}>
                        <Trash2 size={15} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </div>
                {a.body && <p className={`text-sm mt-3 leading-relaxed whitespace-pre-wrap ${t.sub}`}>{a.body}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-[#0c1311]/60 flex items-end sm:items-center justify-center sm:p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}>
          <form onSubmit={save} role="dialog" aria-modal="true" aria-label={editing.id ? 'Edit announcement' : 'New announcement'}
            className={`w-full sm:max-w-xl max-h-[92vh] overflow-y-auto border rounded-t-3xl sm:rounded-3xl p-6 shadow-xl ${t.modal}`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className={`text-lg font-bold ${t.text}`}>{editing.id ? 'Edit announcement' : 'New announcement'}</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close"
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:bg-black/5`}><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={label} htmlFor="a-title">Title</label>
                <input id="a-title" name="title" value={form.title} onChange={change} maxLength={120} required
                  placeholder="e.g. Sunday service moves to 9 AM" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="a-body">Message <span className="font-normal">(optional)</span></label>
                <textarea id="a-body" name="body" rows={5} value={form.body} onChange={change} maxLength={4000}
                  placeholder="Details, time, place…" className={`${field} resize-y`} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="a-branch">Show to</label>
                  {isPastor ? (
                    <select id="a-branch" name="church_id" value={form.church_id} onChange={change} className={field}>
                      <option value="">All branches</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : (
                    <p className={`${field} opacity-80`}>{branchName(myChurch)}</p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="a-exp">Stop showing after <span className="font-normal">(optional)</span></label>
                  <input id="a-exp" type="date" name="expires_on" value={form.expires_on} onChange={change} min={today} className={field} />
                </div>
              </div>
              <label className={`flex items-center gap-2.5 text-sm cursor-pointer w-fit ${t.sub}`}>
                <input type="checkbox" name="is_pinned" checked={form.is_pinned} onChange={change} className="w-4 h-4 accent-[#c5a66a]" />
                Pin to the top
              </label>

              {formError && <p className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{formError}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditing(null)} disabled={saving}
                  className={`flex-1 border rounded-xl h-11 text-sm font-semibold disabled:opacity-50 ${t.ghost}`}>Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl h-11 text-sm font-semibold">
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  {saving ? 'Saving...' : editing.id ? 'Save changes' : 'Post announcement'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
