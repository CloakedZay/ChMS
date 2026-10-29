'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { authFetch } from '@/app/lib/authFetch';
import { alertDialog, confirmDialog } from '@/app/lib/dialog';
import { friendlyError } from '@/app/lib/errors';

// The handouts of one training module (module_handouts + the private
// 'handouts' bucket, under module-<id>/), same as on the Training page.
// canEdit: may upload and delete — the database decides that (db/092:
// the Secretary uploads, own branch's ministries and the general path). A new
// handout is also made searchable by the Assistant (api/knowledge/handout).

const MAX_BYTES = 20 * 1024 * 1024;

function fetchHandouts(moduleId) {
  return supabase.from('module_handouts').select('*').eq('module_id', moduleId).order('created_at', { ascending: false });
}

export default function ModuleHandouts({ moduleId, canEdit, t }) {
  const [list, setList] = useState(null);   // null while loading
  const [desc, setDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const apply = useCallback(({ data }) => setList(data || []), []);
  useEffect(() => {
    let stale = false;
    fetchHandouts(moduleId).then((res) => { if (!stale) apply(res); });
    return () => { stale = true; };
  }, [moduleId, apply]);
  const reload = async () => apply(await fetchHandouts(moduleId));

  async function upload(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('File too large. Max 20MB.'); return; }
    setUploading(true);
    setError('');
    try {
      const filePath = `module-${moduleId}/${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
      const { error: storageErr } = await supabase.storage.from('handouts').upload(filePath, file, { contentType: file.type, upsert: false });
      if (storageErr) throw storageErr;
      const { data: saved, error: dbErr } = await supabase.from('module_handouts').insert({
        module_id: moduleId, file_name: file.name, file_path: filePath, file_size: file.size,
        description: desc.trim() || null, uploaded_by: 'Staff',
      }).select('id').single();
      if (dbErr) {
        await supabase.storage.from('handouts').remove([filePath]);
        throw dbErr;
      }
      // Searchable by the Assistant; the upload still counts if this fails.
      try {
        const res = await authFetch('/api/knowledge/handout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handout_id: saved.id }),
        });
        const result = await res.json();
        if (!res.ok || result.skipped) setError(`Uploaded. The assistant can't search it: ${result.skipped || result.error || 'indexing failed'}.`);
      } catch { /* searchable after the next rebuild */ }
      setDesc('');
      await reload();
    } catch (err) {
      setError(friendlyError(err, 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function open(h) {
    const { data, error: e } = await supabase.storage.from('handouts').createSignedUrl(h.file_path, 60);
    if (e) { alertDialog('Could not open the handout.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function remove(h) {
    if (!await confirmDialog(`Delete "${h.file_name}"?`)) return;
    const { error: e } = await supabase.from('module_handouts').delete().eq('id', h.id);
    if (e) { setError(friendlyError(e)); return; }
    await supabase.storage.from('handouts').remove([h.file_path]);
    await reload();
  }

  return (
    <div className="space-y-2">
      {list === null ? (
        <p className={`text-xs ${t.textMuted}`}>Loading handouts…</p>
      ) : list.length === 0 ? (
        <p className={`text-xs ${t.textMuted}`}>No handouts yet.</p>
      ) : list.map((h) => (
        <div key={h.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${t.cardBorder}`}>
          <FileText size={14} className="text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <button type="button" onClick={() => open(h)} className={`block w-full text-left text-xs font-semibold ${t.textPrimary} truncate hover:text-blue-400`}>{h.file_name}</button>
            {h.description && <p className={`text-[11px] ${t.textMuted} truncate`}>{h.description}</p>}
          </div>
          <button type="button" onClick={() => open(h)} aria-label={`Open ${h.file_name}`} title="Open" className={`${t.textMuted} hover:text-blue-400 p-1`}><Download size={13} /></button>
          {canEdit && (
            <button type="button" onClick={() => remove(h)} aria-label={`Delete ${h.file_name}`} title="Delete" className={`${t.textMuted} hover:text-rose-400 p-1`}><Trash2 size={13} /></button>
          )}
        </div>
      ))}

      {canEdit && (
        <div className="space-y-2 pt-1">
          <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description (optional)"
            className={`w-full ${t.inputBg} border ${t.inputBorder} rounded-xl px-3 py-2 text-xs ${t.textPrimary} placeholder:text-slate-500 focus:outline-none focus:border-blue-500`} />
          <label className={`flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl py-3 text-sm font-bold cursor-pointer transition-colors ${uploading ? `${t.uploadBorderDisabled} cursor-not-allowed` : t.uploadBorder}`}>
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Choose file · PDF, DOCX, PPT, images · max 20MB</>}
            <input ref={fileRef} type="file" className="sr-only" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
              disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
