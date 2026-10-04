'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Loader2, Link2, Unlink } from 'lucide-react';

// Link a Google account to the signed-in login (step E2), so they can use
// "Sign in with Google" instead of their username and password. Needs the
// Google provider and "manual linking" turned on in Supabase → Auth.
// A login can always keep its password too; unlinking is only offered when
// the login still has a password, so nobody locks themselves out.

// Turn Supabase's messages into something a church member can act on.
function friendly(message = '') {
  if (/manual linking/i.test(message)) return 'Linking Google accounts is not turned on yet. Please tell the church admin.';
  if (/provider is not enabled|unsupported provider/i.test(message)) return 'Google sign-in is not set up yet. Please tell the church admin.';
  if (/already linked|already exists|identity_already_exists/i.test(message)) return 'That Google account is already linked to another FaithSync login.';
  return message || 'Something went wrong. Please try again.';
}

export default function GoogleAccountCard({ dark = true }) {
  const [identities, setIdentities] = useState(null);
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    // Coming back from Google with an error (e.g. already linked elsewhere)?
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const returned = hash.get('error_description') || query.get('error_description');

    supabase.auth.getUserIdentities().then(({ data, error: idError }) => {
      if (returned) setError(friendly(returned));
      else if (idError) setError(friendly(idError.message));
      setIdentities(data?.identities || []);
    });
  }, []);

  const google      = identities?.find((i) => i.provider === 'google');
  const hasPassword = !!identities?.some((i) => i.provider === 'email');

  async function link() {
    setBusy(true);
    setError('');
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    // On success the browser goes to Google and comes back here.
    if (linkError) { setError(friendly(linkError.message)); setBusy(false); }
  }

  async function unlink() {
    if (!window.confirm('Unlink your Google account? You will sign in with your username and password only.')) return;
    setBusy(true);
    setError('');
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(google);
    if (unlinkError) setError(friendly(unlinkError.message));
    else setIdentities((prev) => prev.filter((i) => i !== google));
    setBusy(false);
  }

  const card  = dark ? 'bg-[#1a1d2e] border-white/10' : 'bg-white border-slate-200';
  const title = dark ? 'text-white/40' : 'text-slate-500';
  const main  = dark ? 'text-white' : 'text-slate-900';
  const sub   = dark ? 'text-white/40' : 'text-slate-500';

  return (
    <div className={`${card} border rounded-3xl p-6`}>
      <p className={`text-[10px] uppercase tracking-widest ${title} font-bold mb-4`}>Google sign-in</p>

      {identities === null ? (
        <p className={`flex items-center gap-2 text-xs ${sub}`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</p>
      ) : google ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-sm font-bold ${main}`}>Linked</p>
            <p className={`text-xs ${sub} truncate`}>{google.identity_data?.email || 'Google account'}</p>
          </div>
          {hasPassword && (
            <button
              onClick={unlink}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              <Unlink className="w-3.5 h-3.5" /> Unlink
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className={`text-xs ${sub} leading-relaxed`}>
            Link your Gmail to sign in with one click using &ldquo;Sign in with Google&rdquo;. Your username and password keep working too.
          </p>
          <button
            onClick={link}
            disabled={busy}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Link Google account
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>
      )}
    </div>
  );
}
