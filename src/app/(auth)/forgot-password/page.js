'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/app/context/ThemeContext';
import { KeyRound, Loader2 } from 'lucide-react';
import Turnstile, { TURNSTILE_ON, TURNSTILE_NEEDED } from '@/app/components/Turnstile';

// "Forgot password?" from the sign-in page (db/080). The person types their
// username or email; api/auth/forgot-password emails a reset link to the
// login's own email (if real) or the Gmail linked with "Sign in with Google".
// The answer is the same whether or not anything matched.

export default function ForgotPasswordPage() {
  const { dark } = useTheme();
  const [login, setLogin]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [sent, setSent]     = useState(false);
  const [captcha, setCaptcha] = useState(null);   // "Verify you are human" token
  const captchaRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    if (!login.trim()) { setError('Enter your username or email.'); return; }
    if (TURNSTILE_ON && !captcha) { setError(TURNSTILE_NEEDED); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), captchaToken: captcha }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.');
      setSent(true);
    } catch (err) {
      setError(err.message);
      captchaRef.current?.reset();   // a token works once
    }
    setBusy(false);
  }

  const pageBg   = dark ? 'bg-[#111815]'    : 'bg-[#f8f7f2]';
  const cardBg   = dark ? 'bg-[#1b2420]'    : 'bg-white';
  const cardBord = dark ? 'border-white/10'  : 'border-slate-200';
  const inputCls = dark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30'
    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400';
  const labelCls = dark ? 'text-white/70' : 'text-slate-600';
  const textMain = dark ? 'text-white'    : 'text-slate-900';
  const textSub  = dark ? 'text-white/50' : 'text-slate-500';

  return (
    <div className={`min-h-screen ${pageBg} flex items-center justify-center p-4`}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/25 mb-4">
            <KeyRound className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className={`text-2xl font-bold ${textMain} tracking-tight`}>Forgot password</h1>
          <p className={`${textSub} text-sm mt-1`}>We&apos;ll email you a link to choose a new one.</p>
        </div>

        <div className={`${cardBg} border ${cardBord} rounded-3xl p-6 space-y-4`}>
          {sent ? (
            <>
              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 leading-relaxed">
                If that login has an email or a linked Google account, a reset link is on its way. Check the inbox and the spam folder. The link works once, for a short time.
              </p>
              <p className={`${textSub} text-xs leading-relaxed`}>
                Linked your Gmail? You don&apos;t need a password: tap &ldquo;Sign in with Google&rdquo; on the sign-in page. No email and no Google? Ask the church admin for a temporary password, then link Google on My Profile.
              </p>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="forgot-login" className={`block text-xs ${labelCls} font-semibold mb-1.5`}>Username or email</label>
                <input
                  id="forgot-login"
                  autoComplete="username"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="juan.delacruz.1234 or yourname@gmail.com"
                  className={`w-full border rounded-xl px-4 py-3 text-sm ${inputCls} focus:outline-none focus:border-blue-500 transition-colors`}
                />
              </div>
              <Turnstile ref={captchaRef} onToken={setCaptcha} dark={dark} />
              {error && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-colors"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send reset link
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
