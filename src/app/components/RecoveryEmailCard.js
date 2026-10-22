'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { authFetch } from '@/app/lib/authFetch';
import { Loader2, Mail, Trash2 } from 'lucide-react';
import { confirmDialog } from '@/app/lib/dialog';

import { friendlyError } from '@/app/lib/errors';
// Recovery email for the signed-in login (db/080), so "Forgot password?" on
// the sign-in page can email a reset link without asking the Admin. Added
// with a 6-digit code sent to it (api/recovery-email), so only an address
// the person can open is ever saved.

// l**************d@gmail.com: only the first and last letter before the @,
// so the address isn't readable over someone's shoulder or in a screenshot,
// but the owner still recognises it. The domain stays, to show which inbox.
function maskEmail(email) {
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  const name = email.slice(0, at);
  const hidden = name.length <= 2 ? name[0] + '*' : name[0] + '*'.repeat(name.length - 2) + name.slice(-1);
  return hidden + email.slice(at);
}

export default function RecoveryEmailCard({ dark = true }) {
  const [saved, setSaved]     = useState(undefined);   // undefined while loading
  const [editing, setEditing] = useState(false);
  const [email, setEmail]     = useState('');
  const [pending, setPending] = useState('');          // waiting for its code
  const [code, setCode]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [note, setNote]       = useState('');

  useEffect(() => {
    supabase.rpc('my_recovery_email').then(({ data, error: loadError }) => {
      // Before db/080 the function doesn't exist; show the empty card.
      if (loadError && !/my_recovery_email/i.test(loadError.message)) setError(friendlyError(loadError));
      setSaved(data?.[0]?.email || null);
    });
  }, []);

  async function call(method, body) {
    const res = await authFetch('/api/recovery-email', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.');
    return json;
  }

  async function sendCode(e) {
    e?.preventDefault();
    setBusy(true); setError(''); setNote('');
    try {
      const { pending_email } = await call('POST', { action: 'send', email: (pending || email).trim() });
      setPending(pending_email);
      setCode('');
      setNote(`A 6-digit code was sent to ${maskEmail(pending_email)}. Check the spam folder too.`);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function confirm(e) {
    e.preventDefault();
    if (code.replace(/\D/g, '').length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setBusy(true); setError(''); setNote('');
    try {
      const { email: confirmed } = await call('POST', { action: 'confirm', code });
      setSaved(confirmed);
      cancel();
      setNote('Saved. "Forgot password?" will send a reset link to this email.');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function remove() {
    if (!await confirmDialog('Remove your recovery email? If you forget your password, you will need to ask the church admin.')) return;
    setBusy(true); setError(''); setNote('');
    try {
      await call('DELETE');
      setSaved(null);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  function cancel() {
    setEditing(false); setPending(''); setEmail(''); setCode('');
  }

  const card  = dark ? 'bg-[#1b2420] border-white/10' : 'bg-white border-slate-200';
  const title = dark ? 'text-white/40' : 'text-slate-500';
  const main  = dark ? 'text-white' : 'text-slate-900';
  const sub   = dark ? 'text-white/40' : 'text-slate-500';
  const input = dark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30'
    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400';

  return (
    <div className={`${card} border rounded-3xl p-6`}>
      <p className={`text-[10px] uppercase tracking-widest ${title} font-bold mb-4`}>Recovery email</p>

      {saved === undefined ? (
        <p className={`flex items-center gap-2 text-xs ${sub}`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</p>
      ) : pending ? (
        <form onSubmit={confirm} className="space-y-3">
          <label htmlFor="recovery-code" className={`block text-xs ${sub}`}>Code sent to {maskEmail(pending)}</label>
          <input
            id="recovery-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm tracking-[0.3em] ${input} focus:outline-none focus:border-blue-500`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Confirm
            </button>
            <button type="button" onClick={sendCode} disabled={busy} className={`text-xs font-semibold ${sub} hover:text-blue-400 px-2 disabled:opacity-50`}>Send a new code</button>
            <button type="button" onClick={cancel} disabled={busy} className={`text-xs font-semibold ${sub} hover:text-blue-400 px-2`}>Cancel</button>
          </div>
        </form>
      ) : editing || !saved ? (
        <form onSubmit={sendCode} className="space-y-3">
          <p className={`text-xs ${sub} leading-relaxed`}>
            {saved
              ? 'Type the new email. A code will be sent to it.'
              : 'Add your own email, so you can reset your password yourself with "Forgot password?" on the sign-in page. You still sign in with your username.'}
          </p>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="yourname@gmail.com"
            aria-label="Recovery email"
            className={`w-full border rounded-xl px-4 py-2.5 text-sm ${input} focus:outline-none focus:border-blue-500`}
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy || !email.trim()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send code
            </button>
            {saved && <button type="button" onClick={cancel} className={`text-xs font-semibold ${sub} hover:text-blue-400 px-2`}>Cancel</button>}
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-sm font-bold ${main} truncate`} title="Hidden for privacy">{maskEmail(saved)}</p>
            <p className={`text-xs ${sub}`}>Reset links for &ldquo;Forgot password?&rdquo; go here.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { setEditing(true); setNote(''); }} disabled={busy} className={`text-xs font-bold ${sub} hover:text-blue-400 px-2 py-1.5`}>Change</button>
            <button
              onClick={remove}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        </div>
      )}

      {note && (
        <p className="mt-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">{note}</p>
      )}
      {error && (
        <p className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>
      )}
    </div>
  );
}
