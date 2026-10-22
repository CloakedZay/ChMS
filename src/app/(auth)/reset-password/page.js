'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/app/lib/supabase';
import { homePathFor } from '@/app/lib/permissions';
import { useTheme } from '@/app/context/ThemeContext';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';

import { friendlyError } from '@/app/lib/errors';
// Where the reset link from "Forgot password?" lands (db/080). Supabase signs
// the person in from the link; they choose a new password here without the
// old one. Only for someone who arrived from a reset link: anyone already
// signed in uses Change password, which asks for the current password.

const MIN_LENGTH = 8;

// Read before Supabase reads the link and clears it from the address bar.
const FROM_LINK = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash);
const LINK_ERROR = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.hash.slice(1)).get('error_description')
  : null;

export default function ResetPasswordPage() {
  const router = useRouter();
  const { dark } = useTheme();
  const [state, setState]       = useState('checking');   // checking | ready | invalid
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (LINK_ERROR) setState('invalid');
      else if (event === 'PASSWORD_RECOVERY' || (FROM_LINK && session)) setState('ready');
      else if (event === 'INITIAL_SESSION') setState((s) => (s === 'ready' ? s : 'invalid'));
    });
    return () => subscription.unsubscribe();
  }, []);

  async function save(e) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) { setError(`Use at least ${MIN_LENGTH} characters.`); return; }
    if (password !== confirm) { setError('The two passwords are not the same.'); return; }
    setSaving(true);
    setError('');

    const { data, error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      setError(friendlyError(pwError));
      setSaving(false);
      return;
    }

    // A temporary password from the Admin no longer needs changing.
    const { data: profile } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', data.user.id)
      .select('role')
      .maybeSingle();
    router.replace(homePathFor(profile?.role));
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
          <h1 className={`text-2xl font-bold ${textMain} tracking-tight`}>Choose a new password</h1>
        </div>

        <div className={`${cardBg} border ${cardBord} rounded-3xl p-6`}>
          {state === 'checking' ? (
            <p className={`flex items-center justify-center gap-2 text-xs ${textSub}`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking the link...</p>
          ) : state === 'invalid' ? (
            <div className="space-y-4">
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 leading-relaxed">
                This link has expired or was already used. Ask for a new one.
              </p>
              <Link href="/forgot-password" className="block text-center w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm py-3 rounded-xl transition-colors">
                Send a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={save} className="space-y-4">
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
              {error && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>
              )}
              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save password
              </button>
            </form>
          )}
        </div>

        <p className={`text-center text-xs mt-6 ${textSub}`}>
          <Link href="/login" className="hover:text-blue-400">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
