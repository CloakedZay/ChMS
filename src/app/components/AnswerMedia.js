'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Video, Square, Upload, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';

// Voice and video answers in discipleship (db/098). The recording lives in
// the private 'answer-media' bucket under the member's own folder.

export const ANSWER_BUCKET = 'answer-media';
const MAX_SECONDS = 180;               // 3 minutes
const MAX_BYTES = 25 * 1024 * 1024;    // 25 MB

// Uploads a recorded or chosen file; returns { media_path, media_type }.
export async function uploadAnswerMedia(userId, draft) {
  const ext = (draft.blob.type.split('/')[1] || 'webm').split(';')[0];
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(ANSWER_BUCKET)
    .upload(path, draft.blob, { contentType: draft.blob.type || (draft.kind === 'video' ? 'video/webm' : 'audio/webm') });
  if (error) throw error;
  return { media_path: path, media_type: draft.kind };
}

// Plays a saved answer recording (signed link, 1 hour).
export function AnswerPlayback({ path, type, className = '' }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    supabase.storage.from(ANSWER_BUCKET).createSignedUrl(path, 3600).then(({ data, error }) => {
      if (gone) return;
      if (error) setFailed(true); else setUrl(data.signedUrl);
    });
    return () => { gone = true; };
  }, [path]);
  if (failed) return <p className={`text-xs opacity-70 ${className}`}>The recording can&apos;t be played.</p>;
  if (!url) return <Loader2 size={14} className="animate-spin opacity-60" />;
  return type === 'video'
    ? <video src={url} controls playsInline className={`w-full max-h-72 rounded-xl bg-black ${className}`} />
    : <audio src={url} controls className={`w-full ${className}`} />;
}

// Record a voice or video answer, or attach a file. draft: { blob, kind, url } | null.
export function AnswerRecorder({ draft, onChange }) {
  const [recording, setRecording] = useState(null);   // 'audio' | 'video' | null
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const previewRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
  }, []);

  // Show the camera while a video is being recorded.
  useEffect(() => {
    if (recording === 'video' && previewRef.current && streamRef.current) {
      previewRef.current.srcObject = streamRef.current;
      previewRef.current.play().catch(() => {});
    }
  }, [recording]);

  function setDraft(blob, kind) {
    if (blob.size > MAX_BYTES) { setError('That recording is larger than 25 MB. Keep it under 3 minutes.'); return; }
    if (draft?.url) URL.revokeObjectURL(draft.url);
    onChange({ blob, kind, url: URL.createObjectURL(blob) });
  }

  async function start(kind) {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { audio: true, video: { width: 640 } } : { audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        clearInterval(timerRef.current);
        setRecording(null);
        setDraft(new Blob(chunks, { type: rec.mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm') }), kind);
      };
      recRef.current = rec;
      rec.start();
      setRecording(kind);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) rec.state === 'recording' && rec.stop();
        return s + 1;
      }), 1000);
    } catch {
      setError(kind === 'video' ? 'Could not use the camera. Allow it in the browser, or attach a video instead.' : 'Could not use the microphone. Allow it in the browser, or attach a recording instead.');
    }
  }

  const stop = () => recRef.current?.state === 'recording' && recRef.current.stop();

  function pick(file) {
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : null;
    if (!kind) { setError('Choose an audio or video file.'); return; }
    setError('');
    setDraft(file, kind);
  }

  const btn = 'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5';
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-2">
      {recording === 'video' && <video ref={previewRef} muted playsInline className="w-full max-h-60 rounded-xl bg-black" />}
      {recording ? (
        <button type="button" onClick={stop} className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl bg-rose-600 text-white">
          <Square size={12} /> Stop recording · {mm} / 3:00
        </button>
      ) : draft ? (
        <div className="space-y-1.5">
          {draft.kind === 'video'
            ? <video src={draft.url} controls playsInline className="w-full max-h-60 rounded-xl bg-black" />
            : <audio src={draft.url} controls className="w-full" />}
          <button type="button" onClick={() => { URL.revokeObjectURL(draft.url); onChange(null); }} className={btn}>
            <Trash2 size={12} /> Remove recording
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <span className="text-[11px] text-white/40 self-center">Or answer with:</span>
          <button type="button" onClick={() => start('audio')} className={btn}><Mic size={12} /> Voice</button>
          <button type="button" onClick={() => start('video')} className={btn}><Video size={12} /> Video</button>
          <label className={`${btn} cursor-pointer`}>
            <Upload size={12} /> Attach
            <input type="file" accept="audio/*,video/*" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
