'use client';

import { useEffect, useImperativeHandle, useRef, useState } from 'react';

// "Verify you are human" check (Cloudflare Turnstile, docs/DEPLOYMENT.md
// step 5). Shows nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set.
// onToken gets the token once the check passes, and null when it expires.
// A token works once: after each try, call ref.current.reset() for a new one.
// Supabase checks the token on sign-in (captchaToken) once CAPTCHA
// protection is on there; api/auth/forgot-password checks it itself
// (lib/turnstile.ts).

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const TURNSTILE_ON = !!SITE_KEY;
export const TURNSTILE_NEEDED = 'Please finish the "Verify you are human" check first.';
export const TURNSTILE_FAILED = 'The "Verify you are human" check failed or expired. Please try again.';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; s.remove(); reject(new Error('Turnstile did not load')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export default function Turnstile({ ref, onToken, dark }) {
  const box = useRef(null);
  const widget = useRef(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current?.(null);
      if (widget.current != null) window.turnstile?.reset(widget.current);
    },
  }), []);

  useEffect(() => {
    if (!SITE_KEY) return;
    let gone = false;
    loadScript().then(() => {
      if (gone || !box.current) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: SITE_KEY,
        theme: dark ? 'dark' : 'light',
        callback: (token) => onTokenRef.current?.(token),
        'expired-callback': () => onTokenRef.current?.(null),
        'error-callback': () => onTokenRef.current?.(null),
      });
    }).catch(() => { if (!gone) setFailed(true); });
    return () => {
      gone = true;
      if (widget.current != null) window.turnstile?.remove(widget.current);
      widget.current = null;
      onTokenRef.current?.(null);
    };
  }, [dark]);

  if (!SITE_KEY) return null;
  if (failed) {
    return (
      <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
        The &quot;Verify you are human&quot; check couldn&apos;t load. Check your internet connection, then reload the page.
      </p>
    );
  }
  return <div ref={box} className="flex justify-center min-h-[65px]" />;
}
