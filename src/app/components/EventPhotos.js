'use client';

import { useEffect, useState } from 'react';
import { Camera, ImageIcon, Loader2, X } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { confirmDialog } from '@/app/lib/dialog';
import { friendlyError } from '@/app/lib/errors';
import { shrinkPhoto } from '@/app/lib/shrinkPhoto';

// Photos of a gathering (db/094): an album on each past event. The Pastor
// and the branch's Secretary, Leaders and attendance helpers add them;
// everyone who sees the event sees the album. canAdd is only a hint for
// showing the button — the database decides.

const BUCKET = 'event-photos';
const missingSetup = (msg) => /does not exist|schema cache|Could not find/i.test(msg || '');

async function fetchPhotos(eventId) {
  const { data, error } = await supabase.from('event_photos')
    .select('id, file_path, file_name, caption, uploader_name, created_at').eq('event_id', eventId).order('created_at');
  if (error) return missingSetup(error.message) ? [] : null;
  if (!data?.length) return [];
  const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(data.map((p) => p.file_path), 3600);
  return data.map((p, i) => ({ ...p, url: urls?.[i]?.signedUrl || null }));
}

export default function EventPhotos({ eventId, canAdd, dark = true }) {
  const [photos, setPhotos] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);   // photo shown large

  useEffect(() => {
    let gone = false;
    fetchPhotos(eventId).then((list) => { if (!gone) setPhotos(list || []); });
    return () => { gone = true; };
  }, [eventId]);
  const reload = () => fetchPhotos(eventId).then((list) => setPhotos(list || []));

  async function upload(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setError('');
    setUploading(true);
    for (const file of files) {
      const body = await shrinkPhoto(file, 1800);
      if (body.size > 10 * 1024 * 1024) { setError(`${file.name} is larger than 10 MB.`); continue; }
      const jpeg = body !== file;
      const safe = (jpeg ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
      const path = `${eventId}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(path, body, { contentType: jpeg ? 'image/jpeg' : file.type, upsert: false });
      if (upErr) { setError(`Couldn't upload ${file.name}: ${friendlyError(upErr)}`); continue; }
      const { error: rowErr } = await supabase.from('event_photos')
        .insert({ event_id: eventId, file_path: path, file_name: file.name, file_size: body.size });
      if (rowErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        setError(missingSetup(rowErr.message) ? 'Event photos need db/094_event_photos.sql. Ask the administrator to run it.' : `Couldn't save ${file.name}: ${friendlyError(rowErr)}`);
      }
    }
    setUploading(false);
    reload();
  }

  async function remove(p) {
    if (!await confirmDialog({ message: `Remove this photo (${p.file_name})?`, confirmText: 'Remove' })) return;
    const { error: e } = await supabase.from('event_photos').delete().eq('id', p.id);
    if (e) { setError(friendlyError(e)); return; }
    await supabase.storage.from(BUCKET).remove([p.file_path]);
    setOpen(null);
    reload();
  }

  if (photos !== null && !photos.length && !canAdd) return null;
  const muted = dark ? 'text-white/50' : 'text-slate-500';
  const zone = dark ? 'border-white/20 text-white/70 hover:border-blue-400' : 'border-slate-300 text-slate-600 hover:border-blue-500';

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <p className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${muted}`}>
          <ImageIcon size={12} /> Photos{photos?.length ? ` (${photos.length})` : ''}
        </p>
        {canAdd && (
          <label className={`ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border-2 border-dashed text-[11px] font-bold cursor-pointer ${zone} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {uploading ? 'Uploading…' : 'Add photos'}
            <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading}
              onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-rose-500 mb-2">{error}</p>}
      {photos === null ? (
        <div className="grid grid-cols-4 gap-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-square rounded-lg" />)}</div>
      ) : photos.length === 0 ? (
        <p className={`text-xs ${muted}`}>No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-4 gap-1.5">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p)} aria-label={`Open photo ${p.file_name}`}
                className="block w-full aspect-square rounded-lg overflow-hidden bg-black/10">
                {p.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover hover:scale-105 transition-transform" />
                  : <span className={`flex items-center justify-center h-full text-[10px] ${muted}`}>Can&apos;t load</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setOpen(null)} role="dialog" aria-label="Photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt={open.file_name} className="max-w-full max-h-[85vh] rounded-xl" onClick={(e) => e.stopPropagation()} />
          <div className="absolute top-4 right-4 flex gap-2">
            {canAdd && (
              <button onClick={(e) => { e.stopPropagation(); remove(open); }}
                className="h-9 px-3 rounded-lg bg-rose-600 text-white text-xs font-bold">Remove</button>
            )}
            <button onClick={() => setOpen(null)} aria-label="Close" className="w-9 h-9 rounded-lg bg-white/15 text-white flex items-center justify-center"><X size={16} /></button>
          </div>
          {open.uploader_name && <p className="absolute bottom-4 text-xs text-white/70">Added by {open.uploader_name}</p>}
        </div>
      )}
    </div>
  );
}
