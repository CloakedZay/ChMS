'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { homePathFor } from '@/app/lib/permissions';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import GoogleAccountCard from '@/app/components/GoogleAccountCard';
import RecoveryEmailCard from '@/app/components/RecoveryEmailCard';

import { friendlyError } from '@/app/lib/errors';
import { confirmDialog } from '@/app/lib/dialog';
// First sign-in for a login the Secretary created (db/014): the member
// replaces the temporary password with their own, then goes to their
// dashboard. Anyone else can use it to change their password too; they
// confirm their current password first, unless they've never had one
// (Google-only sign-in).
//
// Second check (NEXT_PUBLIC_PASSWORD_EMAIL_CODE=on): a 6-digit code is
// emailed (Supabase reauthenticate) and must be typed before the password
// changes. Not on the first sign-in (the temporary password was handed over
// in person), and not for made-up usernames (@members.faithsync.app), which
// can't receive email; those keep the current-password check. It is a
// setting rather than "skip it if the email fails", so nobody can get
// around it by making the email fail. Needs email sending (SMTP) set up in
// Supabase first: docs/DEPLOYMENT.md.

const MIN_LENGTH = 8;
const EMAIL_CODE_ON = process.env.NEXT_PUBLIC_PASSWORD_EMAIL_CODE === 'on';
const NO_EMAIL_DOMAIN = '@members.faithsync.app';   // api/members/create-login
const RESEND_SECONDS = 60;

export default function ChangePasswordPage() {
  const router = useRouter();
  const { dark } = useTheme();
  const { user, role, loading, mustChangePassword, setMustChangePassword } = useAuth();

  const [current, setCurrent]   = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);
  const [codeSent, setCodeSent] = useState(false);   // waiting for the emailed code
  const [code, setCode]         = useState('');
  const [wait, setWait]         = useState(0);       // seconds until "Send a new code"

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Forced first change: they just signed in with the temporary password.
  // Google-only accounts have no password to confirm.
  const hasPassword = !!user?.identities?.some((i) => i.provider === 'email');
  const askCurrent  = !mustChangePassword && hasPassword;
  const realEmail   = !!user?.email && !user.email.toLowerCase().endsWith(NO_EMAIL_DOMAIN);
  const askCode     = EMAIL_CODE_ON && !mustChangePassword && realEmail;

  // Count down to "Send a new code".
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function sendCode() {
    const { error: sendError } = await supabase.auth.reauthenticate();
    if (sendError) {
      setError("We couldn't send the code: " + friendlyError(sendError));
      return false;
    }
    setWait(RESEND_SECONDS);
    return true;
  }

  async function resendCode() {
    setError('');
    if (await sendCode()) setCode('');
  }

  function cancelCode() {
    setCodeSent(false);
    setCode('');
    setError('');
  }

  async function handleSave(e) {
    e.preventDefault();
    if (codeSent) { await finishWithCode(); return; }
    if (askCurrent && !current) { setError('Enter your current password.'); return; }
    if (password.length < MIN_LENGTH) { setError(`Use at least ${MIN_LENGTH} characters.`); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    // Ask first, so a password isn't changed by a slip. Not on the first
    // sign-in: there, setting a password is the only way on.
    if (!mustChangePassword && !await confirmDialog({
      title: 'Change your password?',
      message: 'Are you sure you want to change your password? From now on you will sign in with the new one.',
      confirmText: 'Yes, change it',
      cancelText: 'Not now',
    })) return;
    setError('');
    setSaving(true);
    setDone(false);

    if (askCurrent) {
      const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (checkError) {
        setError('Your current password is not correct.');
        setSaving(false);
        return;
      }
    }

    // Second check: email a code, then wait for it (finishWithCode).
    if (askCode) {
      const sent = await sendCode();
      setSaving(false);
      if (sent) setCodeSent(true);
      return;
    }

    await savePassword();
  }

  async function finishWithCode() {
    const nonce = code.replace(/\D/g, '');
    if (nonce.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setError('');
    setSaving(true);
    await savePassword(nonce);
  }

  async function savePassword(nonce) {
    const { error: pwError } = await supabase.auth.updateUser(nonce ? { password, nonce } : { password });
    if (pwError && nonce && (pwError.code === 'reauthentication_not_valid' || /nonce|reauthenticat/i.test(pwError.message))) {
      setError('That code is not right, or it has expired. Check the email or send a new code.');
      setSaving(false);
      return;
    }
    if (pwError) {
      setError(pwError.message.includes('different')
        ? 'Choose a password different from the temporary one.'
        : friendlyError(pwError));
      setSaving(false);
      return;
    }

    const { error: flagError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);
    if (flagError) {
      setError('Your password was changed, but something else went wrong: ' + friendlyError(flagError));
      setSaving(false);
      return;
    }

    // First sign-in: straight on to the dashboard. Otherwise confirm it.
    if (mustChangePassword) {
      setMustChangePassword(false);
      router.replace(homePathFor(role));
      return;
    }
    setSaving(false);
    setCurrent('');
    setPassword('');
    setConfirm('');
    setCodeSent(false);
    setCode('');
    setDone(true);
  }

  const pageBg    = dark ? 'bg-[#111815]'   : 'bg-[#f8f7f2]';
  const cardBg    = dark ? 'bg-[#1b2420]'   : 'bg-white';
  const cardBord  = dark ? 'border-white/10' : 'border-slate-200';
  const inputCls  = dark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30'
    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400';
  const labelCls  = dark ? 'text-white/70' : 'text-slate-600';
  const textMain  = dark ? 'text-white'    : 'text-slate-900';
  const textSub   = dark ? 'text-white/50' : 'text-slate-500';

  if (loading || !user) {
    return <div className={`min-h-screen ${pageBg}`} />;
  }

  return (
    <div className={`min-h-screen ${pageBg} flex items-center justify-center p-4`}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/25 mb-4">
            <KeyRound className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className={`text-2xl font-bold ${textMain} tracking-tight`}>
            {mustChangePassword ? 'Set your password' : 'Password & sign-in'}
          </h1>
          <p className={`${textSub} text-xs mt-2 leading-relaxed`}>
            {mustChangePassword
              ? 'You signed in with a temporary password. Choose your own to continue.'
              : 'Choose a new password for your account.'}
          </p>
        </div>

        <form onSubmit={handleSave} className={`${cardBg} border ${cardBord} rounded-3xl p-8 shadow-xl space-y-4`}>
          {codeSent ? (
            <div>
              <p className={`text-sm ${textMain} mb-3`}>
                We emailed a 6-digit code to <span className="font-semibold break-all">{user.email}</span>. Type it here to change your password.
              </p>
              <label htmlFor="email-code" className={`block text-xs ${labelCls} font-semibold mb-1.5`}>Code from the email</label>
              <input
                id="email-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="123456"
                autoFocus
                className={`w-full border rounded-xl px-4 py-3 text-lg tracking-[0.4em] font-mono ${inputCls} focus:outline-none focus:border-blue-500 transition-colors`}
              />
              <div className="flex items-center justify-between mt-2 text-xs">
                <button type="button" onClick={cancelCode} className={`${textSub} hover:text-blue-400 font-semibold`}>← Change the password</button>
                <button type="button" onClick={resendCode} disabled={wait > 0} className="text-blue-500 hover:underline font-semibold disabled:opacity-50 disabled:no-underline">
                  {wait > 0 ? `Send a new code (${wait}s)` : 'Send a new code'}
                </button>
              </div>
              <p className={`${textSub} text-[11px] mt-3`}>No email? Check the spam folder. The code works only for a short time.</p>
            </div>
          ) : (<>
          {askCurrent && (
            <div>
              <label htmlFor="current-password" className={`block text-xs ${labelCls} font-semibold mb-1.5`}>Current password</label>
              <input
                id="current-password"
                type={showPass ? 'text' : 'password'}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                className={`w-full border rounded-xl px-4 py-3 text-sm ${inputCls} focus:outline-none focus:border-blue-500 transition-colors`}
              />
            </div>
          )}

          <div>
            <label htmlFor="new-password" className={`block text-xs ${labelCls} font-semibold mb-1.5`}>New password</label>
            <div className="relative">
              <input
                id="new-password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={`At least ${MIN_LENGTH} characters`}
                className={`w-full border rounded-xl px-4 py-3 pr-11 text-sm ${inputCls} focus:outline-none focus:border-blue-500 transition-colors`}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Hide passwords' : 'Show passwords'}
                aria-pressed={showPass}
                className={`absolute right-3 top-3 ${dark ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'} transition-colors`}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className={`block text-xs ${labelCls} font-semibold mb-1.5`}>Type it again</label>
            <input
              id="confirm-password"
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={`w-full border rounded-xl px-4 py-3 text-sm ${inputCls} focus:outline-none focus:border-blue-500 transition-colors`}
            />
          </div>
          {EMAIL_CODE_ON && !mustChangePassword && !realEmail && (
            <p className={`${textSub} text-[11px] leading-relaxed`}>
              Your login has no email, so no code can be sent to confirm this change. Ask the Secretary to add your email, or link Google below, for the extra check.
            </p>
          )}
          </>)}

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>
          )}
          {done && (
            <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              ✓ Your password has been changed. Use it the next time you sign in.
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-colors"
          >
            {saving ? (codeSent ? 'Checking...' : 'Saving...') : codeSent ? 'Confirm and change password' : askCode ? 'Continue' : 'Save password'}
          </button>

          {!mustChangePassword && (
            <Link
              href={homePathFor(role)}
              className={`block text-center text-xs font-semibold ${textSub} hover:text-blue-400 transition-colors`}
            >
              ← Back to dashboard
            </Link>
          )}
        </form>

        {/* Not during the forced first change — one thing at a time. */}
        {!mustChangePassword && (
          <div className="mt-5 space-y-5">
            <GoogleAccountCard dark={dark} />
            <RecoveryEmailCard dark={dark} />
          </div>
        )}
      </div>
    </div>
  );
}
