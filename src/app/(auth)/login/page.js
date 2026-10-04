'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';
import { homePathFor } from '@/app/lib/permissions';
import { DISABLED_MESSAGE, DISABLED_FLAG } from '@/app/lib/disabledLogin';
import { Eye, EyeOff, Sun, Moon } from 'lucide-react';

function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem('faithsync-theme');
    if (stored) setDark(stored === 'dark');
  }, []);
  function toggle() {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem('faithsync-theme', next ? 'dark' : 'light');
      return next;
    });
  }
  return { dark, toggle };
}

export default function LoginPage() {
  const router = useRouter();
  const { dark, toggle: toggleTheme } = useTheme();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Already logged in? Skip straight through
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        redirectByRole(session.user.id);
        return;
      }
      // Back from Google with an error (e.g. not set up yet)?
      const back = new URLSearchParams(window.location.hash.slice(1)).get('error_description')
        || new URLSearchParams(window.location.search).get('error_description');
      if (back) setError(`Google sign-in didn't work: ${back}`);

      // Signed out because the account was disabled? Say so.
      try {
        if (sessionStorage.getItem(DISABLED_FLAG)) {
          sessionStorage.removeItem(DISABLED_FLAG);
          setError(DISABLED_MESSAGE);
        }
      } catch {}
    });
  }, []);

  async function redirectByRole(userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, disabled')
      .eq('id', userId)
      .single();

    if (profile?.disabled) {
      await supabase.auth.signOut();
      setError(DISABLED_MESSAGE);
      setLoading(false);
      return;
    }

    router.replace(homePathFor(profile?.role));
  }

  // Sign in with Google (step E2). Google sends the person back here and the
  // effect above takes them to their dashboard. Someone whose Google account
  // isn't linked to a login gets a new Member login with no branch yet.
  async function handleGoogle() {
    setError('');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (oauthError) {
      setError(/not enabled|unsupported provider/i.test(oauthError.message)
        ? 'Google sign-in is not set up yet. Please use your username and password.'
        : oauthError.message);
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError('Invalid email or password. Please try again.');
      setLoading(false);
      return;
    }

    // Role check then redirect — no blocking, just routing
    await redirectByRole(data.user.id);
  }

  // Theme tokens
  const pageBg    = dark ? 'bg-[#0f111a]'    : 'bg-slate-100';
  const cardBg    = dark ? 'bg-[#1a1d2e]'    : 'bg-white';
  const cardBord  = dark ? 'border-white/10'  : 'border-slate-200';
  const inputBg   = dark ? 'bg-white/5'       : 'bg-slate-50';
  const inputBord = dark ? 'border-white/10'  : 'border-slate-300';
  const inputText = dark ? 'text-white placeholder:text-white/30' : 'text-slate-900 placeholder:text-slate-400';
  const labelCls  = dark ? 'text-white/70'    : 'text-slate-600';
  const textMain  = dark ? 'text-white'       : 'text-slate-900';
  const textSub   = dark ? 'text-white/50'    : 'text-slate-500';
  const backLink  = dark ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-slate-700';
  const iconBtn   = dark
    ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900';

  return (
    <div className={`min-h-screen ${pageBg} flex items-center justify-center p-4 relative transition-colors duration-200`}>

      {/* Grid bg — dark only */}
      {dark && (
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(#4f6fff 1px, transparent 1px), linear-gradient(90deg, #4f6fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      )}

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className={`absolute top-5 right-5 p-2 rounded-full border ${iconBtn} transition-colors`}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="relative w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/25 mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-6 h-6 text-blue-400">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </div>
          <h1 className={`text-2xl font-black ${textMain} tracking-tight`}>FaithSync</h1>
          <p className={`${textSub} text-xs mt-1 tracking-widest uppercase`}>GGCF-GMI · Pandi, Bulacan</p>
        </div>

        {/* Card */}
        <div className={`${cardBg} border ${cardBord} rounded-3xl p-8 shadow-2xl shadow-black/20`}>
          <h2 className={`text-base font-bold ${textMain} mb-1`}>Welcome back</h2>
          <p className={`${textSub} text-xs mb-7`}>Sign in — you'll be taken to your dashboard automatically.</p>

          <div className="space-y-4">

            {/* Email */}
            <div>
              <label className={`block text-[10px] uppercase tracking-widest ${labelCls} font-bold mb-2`}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@email.com"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className={`w-full ${inputBg} border ${inputBord} rounded-xl px-4 py-3 text-sm ${inputText} focus:outline-none focus:border-blue-500 transition-colors`}
              />
            </div>

            {/* Password */}
            <div>
              <label className={`block text-[10px] uppercase tracking-widest ${labelCls} font-bold mb-2`}>Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className={`w-full ${inputBg} border ${inputBord} rounded-xl px-4 py-3 pr-11 text-sm ${inputText} focus:outline-none focus:border-blue-500 transition-colors`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPass(v => !v)}
                  className={`absolute right-3 top-3 ${dark ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'} transition-colors`}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            {/* Sign In */}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>

            {/* Or Google */}
            <div className="flex items-center gap-3 pt-1">
              <div className={`flex-1 h-px ${dark ? 'bg-white/10' : 'bg-slate-200'}`} />
              <span className={`text-[10px] uppercase tracking-widest ${textSub}`}>or</span>
              <div className={`flex-1 h-px ${dark ? 'bg-white/10' : 'bg-slate-200'}`} />
            </div>
            <button
              type="button"
              onClick={handleGoogle}
              className={`w-full flex items-center justify-center gap-2 border rounded-xl py-3 text-sm font-bold transition-colors ${
                dark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
              </svg>
              Sign in with Google
            </button>
          </div>

          <p className={`mt-6 text-center text-[10px] ${dark ? 'text-white/20' : 'text-slate-400'} leading-relaxed`}>
            Your access level is set by the administrator.<br />
            Contact your pastor if you can't log in.<br />
            Page visits and time spent are recorded for church records.
          </p>
        </div>

        <p className={`text-center text-sm mt-6 ${backLink} transition-colors`}>
          <a href="/">← Back to Home</a>
        </p>
      </div>
    </div>
  );
}