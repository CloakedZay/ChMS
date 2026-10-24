'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { alertDialog, confirmDialog } from '@/app/lib/dialog';
import { friendlyError } from '@/app/lib/errors';
import { peso } from '@/app/lib/format';
import { useDialog } from '@/app/lib/useDialog';

// Receipts of one expense in the ledger (db/086): photos or PDFs in the
// private 'receipts' bucket, under tx/<entry id>/. Finance adds and removes
// them while the expense isn't voided; the Pastor and Leaders only open
// them. The database checks all of this; the buttons just follow it.

const MAX_BYTES = 10 * 1024 * 1024;

function fetchReceipts(txId) {
  return supabase.from('transaction_receipts')
    .select('id, file_path, file_name, created_at').eq('transaction_id', txId).order('created_at');
}

export default function LedgerReceipts({ tx, canEdit, t, onClose, onChanged }) {
  const [list, setList] = useState(null);   // null while loading
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useDialog(true, () => { if (!uploading) onClose(); });

  // Show what fetchReceipts found (and pass the count back to the ledger).
  const apply = useCallback(({ data, error: e }) => {
    if (e) {
      setError(/transaction_receipts|schema cache|does not exist/i.test(e.message)
        ? 'Receipts need db/086_ledger_receipts.sql. Ask the administrator to run it.'
        : friendlyError(e));
      setList([]);
      return;
    }
    setList(data || []);
    onChanged?.(tx.id, (data || []).length);
  }, [tx.id, onChanged]);

  const load = async () => apply(await fetchReceipts(tx.id));

  useEffect(() => {
    let stale = false;
    fetchReceipts(tx.id).then((res) => { if (!stale) apply(res); });
    return () => { stale = true; };
  }, [tx.id, apply]);

  async function upload(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError('');
    setUploading(true);
    for (const file of files) {
      if (file.size > MAX_BYTES) { setError(`${file.name} is larger than 10 MB.`); continue; }
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
      const path = `tx/${tx.id}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { setError(`Could not upload ${file.name}: ${friendlyError(upErr)}`); continue; }
      const { error: rowErr } = await supabase.from('transaction_receipts').insert({
        transaction_id: tx.id, file_path: path, file_name: file.name.slice(0, 200), file_size: file.size,
      });
      if (rowErr) {
        await supabase.storage.from('receipts').remove([path]);
        setError(`Could not save ${file.name}: ${friendlyError(rowErr)}`);
      }
    }
    setUploading(false);
    await load();
  }

  async function open(rc) {
    const { data, error: e } = await supabase.storage.from('receipts').createSignedUrl(rc.file_path, 120);
    if (e) { alertDialog('Could not open the receipt: ' + friendlyError(e)); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function remove(rc) {
    if (!await confirmDialog(`Remove ${rc.file_name}?`)) return;
    const { error: e } = await supabase.from('transaction_receipts').delete().eq('id', rc.id);
    if (e) { setError('Could not remove: ' + friendlyError(e)); return; }
    await supabase.storage.from('receipts').remove([rc.file_path]);
    await load();
  }

  const when = tx.date ? new Date(tx.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Receipts"
        className={`${t.modalBg} border ${t.modalBorder} rounded-2xl w-full max-w-md p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between items-start gap-3 mb-5">
          <div className="min-w-0">
            <h2 className={`text-lg font-black ${t.textPrimary}`}>Receipts</h2>
            <p className={`text-xs ${t.textSub} mt-0.5 truncate`}>{tx.category} · {peso(tx.amount)}{when ? ` · ${when}` : ''}</p>
          </div>
          <button aria-label="Close" onClick={onClose} disabled={uploading} className={`${t.textSub} hover:text-blue-400 transition-colors`}><X size={18} /></button>
        </div>

        <div className="space-y-2">
          {list === null ? (
            <p className={`text-sm ${t.textMuted} py-4 text-center`}>Loading…</p>
          ) : list.length === 0 ? (
            <p className={`text-sm ${t.textMuted} py-4 text-center`}>No receipts yet.</p>
          ) : list.map((rc) => (
            <div key={rc.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${t.inputBorder} ${t.inputBg}`}>
              <FileText size={15} className="text-blue-400 shrink-0" />
              <button onClick={() => open(rc)} className={`flex-1 min-w-0 text-left text-sm ${t.textPrimary} truncate hover:text-blue-400`}>{rc.file_name}</button>
              {canEdit && (
                <button onClick={() => remove(rc)} aria-label={`Remove ${rc.file_name}`} title="Remove" className={`${t.textSub} hover:text-rose-400 shrink-0 p-1`}><Trash2 size={14} /></button>
              )}
            </div>
          ))}

          {canEdit && (
            <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-3.5 text-sm font-bold cursor-pointer transition-colors ${uploading ? `${t.uploadBorderDisabled} cursor-not-allowed` : t.uploadBorder}`}>
              {uploading ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><Upload size={15} /> Add receipt · photo or PDF, max 10 MB</>}
              <input type="file" multiple accept="image/*,application/pdf" className="sr-only" disabled={uploading}
                onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>}
      </div>
    </div>
  );
}
