'use client';

import { useEffect, useState } from 'react';
import { NotebookPen, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { alertDialog, confirmDialog } from '@/app/lib/dialog';
import { friendlyError } from '@/app/lib/errors';
import { phToday } from '@/app/lib/phDate';
import DatePicker from '@/app/components/DatePicker';
import { useDialog } from '@/app/lib/useDialog';

// Minutes of meetings (db/095) on the Reports page. The Secretary writes
// them for their branch; the Admin and Pastor read every branch's, Leaders
// their own. church: the branch picked on Reports (null = all the caller
// can see). canEdit: the Secretary.

const EMPTY = { meeting_date: '', title: '', attendees: '', summary: '', decisions: '', action_items: '' };
const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
const missingSetup = (msg) => /does not exist|schema cache|Could not find/i.test(msg || '');

// The latest minutes, for the Reports PDF too.
export async function loadMinutes(church, limit = 50) {
  let q = supabase.from('meeting_minutes')
    .select('id, church_id, meeting_date, title, attendees, summary, decisions, action_items, author_name, updated_at')
    .order('meeting_date', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (church) q = q.eq('church_id', church);
  return q;
}

// A plain page with one meeting's minutes, to print or save as PDF.
function printMinutes(m) {
  const w = window.open('', '_blank');
  if (!w) { alertDialog('Allow pop-ups to print the minutes.'); return; }
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const block = (h, s) => (s ? `<h2>${h}</h2><p>${esc(s).replace(/\n/g, '<br>')}</p>` : '');
  w.document.write(`<!doctype html><title>Minutes — ${esc(m.title)}</title>
    <style>body{font:14px/1.6 Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1e293b}
    h1{font-size:22px;margin:0}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#173f35;margin:24px 0 4px}
    .sub{color:#64748b;font-size:12px}</style>
    <h1>${esc(m.title)}</h1><p class="sub">Minutes of the meeting held ${esc(fmt(m.meeting_date))}${m.author_name ? ` · recorded by ${esc(m.author_name)}` : ''}</p>
    ${block('Present', m.attendees)}${block('Summary of discussion', m.summary)}${block('Decisions', m.decisions)}${block('Action items', m.action_items)}
    <script>window.onload=()=>window.print()</script>`);
  w.document.close();
}

export default function MeetingMinutes({ t, dark, church, canEdit, branchName, reloadKey }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);       // null = closed; { ...EMPTY, id? }
  const [saving, setSaving] = useState(false);
  const dialogRef = useDialog(!!form, () => { if (!saving) setForm(null); });

  const reload = () => loadMinutes(church).then(({ data, error: e }) => {
    setError(e ? (missingSetup(e.message) ? 'Not set up yet — ask the administrator to run db/095_meeting_minutes.sql.' : friendlyError(e)) : '');
    setList(data || []);
  });
  useEffect(() => {
    let stale = false;
    loadMinutes(church).then(({ data, error: e }) => {
      if (stale) return;
      setError(e ? (missingSetup(e.message) ? 'Not set up yet — ask the administrator to run db/095_meeting_minutes.sql.' : friendlyError(e)) : '');
      setList(data || []);
    });
    return () => { stale = true; };
  }, [church, reloadKey]);

  async function save(e) {
    e.preventDefault();
    if (!form.meeting_date) { alertDialog('Pick the meeting date.'); return; }
    if (!form.title.trim() || !form.summary.trim()) { alertDialog('Give the meeting a title and a summary.'); return; }
    setSaving(true);
    const row = {
      meeting_date: form.meeting_date,
      title: form.title.trim(),
      attendees: form.attendees.trim() || null,
      summary: form.summary.trim(),
      decisions: form.decisions.trim() || null,
      action_items: form.action_items.trim() || null,
    };
    let err;
    if (form.id) {
      ({ error: err } = await supabase.from('meeting_minutes').update(row).eq('id', form.id));
    } else {
      // The Secretary's own branch (the database checks it).
      const { data: { user } } = await supabase.auth.getUser();
      const { data: me } = await supabase.from('profiles').select('church_id').eq('id', user.id).maybeSingle();
      if (!me?.church_id) { setSaving(false); alertDialog('Your account has no branch yet. Ask the Admin to set it.'); return; }
      ({ error: err } = await supabase.from('meeting_minutes').insert({ ...row, church_id: me.church_id }));
    }
    setSaving(false);
    if (err) { alertDialog('Could not save the minutes: ' + friendlyError(err)); return; }
    setForm(null);
    reload();
  }

  async function remove(m) {
    if (!await confirmDialog({ message: `Delete the minutes of "${m.title}" (${fmt(m.meeting_date)})?`, confirmText: 'Delete' })) return;
    const { error: e } = await supabase.from('meeting_minutes').delete().eq('id', m.id);
    if (e) alertDialog(friendlyError(e)); else reload();
  }

  const field = `w-full ${t.inputBg} border ${t.inputBorder} rounded-xl px-3 py-2.5 text-sm ${t.inputText} focus:outline-none focus:border-blue-500`;
  const label = `block text-[10px] uppercase tracking-widest ${t.textSub} font-bold mb-1.5`;

  return (
    <div className={`${t.cardBg} border ${t.cardBorder} rounded-3xl p-6 mb-6`}>
      <div className={`flex items-center gap-2 mb-5 border-b ${t.divider} pb-4`}>
        <h3 className={`text-sm font-black ${t.textPrimary} uppercase tracking-widest flex items-center gap-2`}>
          <NotebookPen className={`w-4 h-4 ${dark ? 'text-purple-400' : 'text-purple-600'}`} /> Minutes of Meetings
        </h3>
        {canEdit && (
          <button onClick={() => setForm({ ...EMPTY, meeting_date: phToday() })}
            className="ml-auto inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-xl">
            <Plus size={14} /> Add minutes
          </button>
        )}
      </div>

      {list === null ? (
        <p className={`${t.textFaint} text-sm text-center py-6`}>Syncing...</p>
      ) : error ? (
        <p className={`text-sm ${dark ? 'text-rose-400' : 'text-rose-600'}`}>{error}</p>
      ) : list.length === 0 ? (
        <p className={`${t.textFaint} text-sm text-center py-6`}>
          No minutes yet.{canEdit ? ' Add the summary of your next meeting here.' : ' The Secretary records them here.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const open = openId === m.id;
            return (
              <li key={m.id} className={`border ${t.cardBorder} rounded-2xl`}>
                <button type="button" onClick={() => setOpenId(open ? null : m.id)} aria-expanded={open}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  {open ? <ChevronDown size={15} className={t.textSub} /> : <ChevronRight size={15} className={t.textSub} />}
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-bold ${t.textPrimary} truncate`}>{m.title}</span>
                    <span className={`block text-xs ${t.textSub}`}>
                      {fmt(m.meeting_date)}{branchName && !church ? ` · ${branchName(m.church_id)}` : ''}{m.author_name ? ` · ${m.author_name}` : ''}
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-3 text-sm">
                    {[['Present', m.attendees], ['Summary of discussion', m.summary], ['Decisions', m.decisions], ['Action items', m.action_items]]
                      .filter(([, v]) => v).map(([h, v]) => (
                        <div key={h}>
                          <p className={`text-[10px] uppercase tracking-widest font-bold ${t.textSub} mb-0.5`}>{h}</p>
                          <p className={`${t.textMuted} whitespace-pre-wrap leading-relaxed`}>{v}</p>
                        </div>
                      ))}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => printMinutes(m)} className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border ${t.toolbarBtn}`}>
                        <Printer size={12} /> Print
                      </button>
                      {canEdit && (
                        <>
                          <button onClick={() => setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v ?? ''])) })}
                            className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border ${t.toolbarBtn}`}>
                            <Pencil size={12} /> Edit
                          </button>
                          <button onClick={() => remove(m)}
                            className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-rose-400 bg-rose-500/10 border border-rose-500/20">
                            <Trash2 size={12} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form ref={dialogRef} onSubmit={save} role="dialog" aria-modal="true" aria-label="Minutes of the meeting"
            className={`w-full max-w-lg max-h-[90vh] overflow-y-auto ${t.modalBg} border ${t.modalBorder} rounded-3xl p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-black ${t.textPrimary}`}>{form.id ? 'Edit minutes' : 'Minutes of the meeting'}</h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Close" className={t.textSub}><X size={18} /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <span className={label}>Meeting date</span>
                <DatePicker value={form.meeting_date} max={phToday()} onChange={(e) => setForm((f) => ({ ...f, meeting_date: e.target.value }))} ariaLabel="Meeting date" className={field} />
              </div>
              <label className="block">
                <span className={label}>Title</span>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={150}
                  placeholder="e.g. Leaders' monthly meeting" className={field} />
              </label>
            </div>
            {[
              ['attendees', 'Present (optional)', 2, 'Names of who attended'],
              ['summary', 'Summary of discussion', 6, 'What was talked about'],
              ['decisions', 'Decisions (optional)', 3, 'What was agreed'],
              ['action_items', 'Action items (optional)', 3, 'Who does what, and by when'],
            ].map(([key, text, rows, ph]) => (
              <label key={key} className="block">
                <span className={label}>{text}</span>
                <textarea value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} rows={rows}
                  placeholder={ph} className={`${field} resize-y`} />
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={`px-4 py-2.5 rounded-xl text-sm font-bold ${t.cancelBtn}`}>Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save minutes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
