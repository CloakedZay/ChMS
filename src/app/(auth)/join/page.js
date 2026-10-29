'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/app/context/ThemeContext';
import { UserPlus, Loader2 } from 'lucide-react';
import Turnstile, { TURNSTILE_ON, TURNSTILE_NEEDED } from '@/app/components/Turnstile';
import { PHONE_HINT } from '@/app/lib/format';

// "Ask to join" (db/093, api/join): the other way to register. Staff can
// add people on the Members page; here a person asks for themselves. The
// branch's Secretary approves the request and, with an email, sends an
// invitation (one-click Google sign-in for a Gmail, or a link to choose a
// password).

export default function JoinPage() {
  const { dark } = useTheme();
  const [branches, setBranches] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', church_id: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState(null);
  const captchaRef = useRef(null);

  useEffect(() => {
    fetch('/api/join').then((r) => r.json()).then((j) => {
      setBranches(j.branches || []);
      if (j.branches?.length === 1) setForm((f) => ({ ...f, church_id: j.branches[0].id }));
    }).catch(() => setBranches([]));
  }, []);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) { setError('Please enter your full name.'); return; }
    if (!form.email.trim() && !form.phone.trim()) { setError('Give an email or a mobile number, so the church can reach you.'); return; }
    if (!form.church_id) { setError('Please choose your branch.'); return; }
    if (TURNSTILE_ON && !captcha) { setError(TURNSTILE_NEEDED); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, captchaToken: captcha }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.');
      setSent(true);
    } catch (err) {
      setError(err.message);
      captchaRef.current?.reset();
    }
    setBusy(false);
  }

  const pageBg   = dark ? 'bg-[#111815]'    : 'bg-[#f8f7f2]';
  const cardBg   = dark ? 'bg-[#1b2420]'    : 'bg-white';
  const cardBord = dark ? 'border-white/10'  : 'border-slate-200';
  const inputCls = `w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors ${dark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30'
    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'}`;
  const labelCls = `block text-xs font-semibold mb-1.5 ${dark ? 'text-white/70' : 'text-slate-600'}`;
  const textMain = dark ? 'text-white'    : 'text-slate-900';
  const textSub  = dark ? 'text-white/50' : 'text-slate-500';

  return (
    <div className={`min-h-screen ${pageBg} flex items-center justify-center p-4`}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/25 mb-4">
            <UserPlus className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className={`text-2xl font-bold ${textMain} tracking-tight`}>Ask to join</h1>
          <p className={`${textSub} text-sm mt-1`}>The church secretary checks your request, then invites you.</p>
        </div>

        <div className={`${cardBg} border ${cardBord} rounded-3xl p-6 space-y-4`}>
          {sent ? (
            <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 leading-relaxed">
              Thank you! Your request was sent to the church secretary. With an email, you&apos;ll get an invitation there:
              tap &ldquo;Sign in with Google&rdquo; if it&apos;s a Gmail, or choose a password from the link.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="j-name" className={labelCls}>Full name</label>
                <input id="j-name" name="full_name" value={form.full_name} onChange={change} maxLength={120} autoComplete="name" className={inputCls} />
              </div>
              <div>
                <label htmlFor="j-email" className={labelCls}>Email (Gmail recommended)</label>
                <input id="j-email" name="email" type="email" value={form.email} onChange={change} maxLength={254} autoComplete="email"
                  placeholder="yourname@gmail.com" className={inputCls} />
              </div>
              <div>
                <label htmlFor="j-phone" className={labelCls}>Mobile number (optional)</label>
                <input id="j-phone" name="phone" inputMode="tel" value={form.phone} onChange={change} maxLength={16}
                  placeholder="09XX XXX XXXX" className={inputCls} />
                <p className={`text-[11px] mt-1 ${textSub}`}>{PHONE_HINT}</p>
              </div>
              <div>
                <label htmlFor="j-branch" className={labelCls}>Branch</label>
                <select id="j-branch" name="church_id" value={form.church_id} onChange={change} className={inputCls} disabled={branches === null}>
                  <option value="">{branches === null ? 'Loading…' : 'Choose your branch'}</option>
                  {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="j-note" className={labelCls}>Anything the secretary should know? (optional)</label>
                <textarea id="j-note" name="note" value={form.note} onChange={change} maxLength={500} rows={2}
                  placeholder="e.g. Invited by Sis. Ana, attending since June" className={`${inputCls} resize-none`} />
              </div>
              <Turnstile ref={captchaRef} onToken={setCaptcha} dark={dark} />
              {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>}
              <button type="submit" disabled={busy}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-colors">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send request
              </button>
            </form>
          )}
          <Link href="/login" className={`block text-center text-xs font-semibold ${textSub} hover:text-blue-400 transition-colors`}>
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
