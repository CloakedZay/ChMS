'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { homePathFor } from '@/app/lib/permissions';
import { Eye, EyeOff, KeyRound } from 'lucide-react';

// First sign-in for a login the Secretary created (db/014): the member
// replaces the temporary password with their own, then goes to their
// dashboard. Anyone else can use it to change their password too; they
// confirm their current password first, unless they've never had one
// (Google-only sign-in).

const MIN_LENGTH = 8;

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

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Forced first change: they just signed in with the temporary password.
  // Google-only accounts have no password to confirm.
  const hasPassword = !!user?.identities?.some((i) => i.provider === 'email');
  const askCurrent  = !mustChangePassword && hasPassword;

  async function handleSave(e) {
    e.preventDefault();
    if (askCurrent && !current) { setError('Enter your current password.'); return; }
    if (password.length < MIN_LENGTH) { setError(`Use at least ${MIN_LENGTH} characters.`); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
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

    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      setError(pwError.message.includes('different')
        ? 'Choose a password different from the temporary one.'
        : pwError.message);
      setSaving(false);
      return;
    }

    const { error: flagError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);
    if (flagError) {
      setError('Your password was changed, but something else went wrong: ' + flagError.message);
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
    setDone(true);
  }

  const pageBg    = dark ? 'bg-[#0f111a]'   : 'bg-slate-100';
  const cardBg    = dark ? 'bg-[#1a1d2e]'   : 'bg-white';
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
          <h1 className={`text-2xl font-black ${textMain} tracking-tight`}>
            {mustChangePassword ? 'Set your password' : 'Change password'}
          </h1>
          <p className={`${textSub} text-xs mt-2 leading-relaxed`}>
            {mustChangePassword
              ? 'You signed in with a temporary password. Choose your own to continue.'
              : 'Choose a new password for your account.'}
          </p>
        </div>

        <form onSubmit={handleSave} className={`${cardBg} border ${cardBord} rounded-3xl p-8 shadow-2xl shadow-black/20 space-y-4`}>
          {askCurrent && (
            <div>
              <label className={`block text-[10px] uppercase tracking-widest ${labelCls} font-bold mb-2`}>Current password</label>
              <input
                type={showPass ? 'text' : 'password'}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                className={`w-full border rounded-xl px-4 py-3 text-sm ${inputCls} focus:outline-none focus:border-blue-500 transition-colors`}
              />
            </div>
          )}

          <div>
            <label className={`block text-[10px] uppercase tracking-widest ${labelCls} font-bold mb-2`}>New password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={`At least ${MIN_LENGTH} characters`}
                className={`w-full border rounded-xl px-4 py-3 pr-11 text-sm ${inputCls} focus:outline-none focus:border-blue-500 transition-colors`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass((v) => !v)}
                className={`absolute right-3 top-3 ${dark ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'} transition-colors`}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-[10px] uppercase tracking-widest ${labelCls} font-bold mb-2`}>Type it again</label>
            <input
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={`w-full border rounded-xl px-4 py-3 text-sm ${inputCls} focus:outline-none focus:border-blue-500 transition-colors`}
            />
          </div>

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
            {saving ? 'Saving...' : 'Save password'}
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
      </div>
    </div>
  );
}
