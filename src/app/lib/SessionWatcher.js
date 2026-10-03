'use client';

import { useEffect } from 'react';
import { supabase } from '@/app/lib/supabase';

// Known issue: the Supabase JS client can deadlock after the tab sits idle
// for a while (background token-refresh timer gets stuck). When that
// happens every supabase.* call hangs forever until a hard reload.
// See: https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0
//
// This component is a watchdog: whenever the tab becomes visible again,
// it makes a lightweight call with a timeout. If the call doesn't resolve
// in time, the client is deadlocked — so we reload automatically instead
// of making you do it by hand.

const HEALTH_CHECK_TIMEOUT_MS = 5000;

export default function SessionWatcher() {
  useEffect(() => {
    let checking = false;

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' || checking) return;
      checking = true;

      let settled = false;

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        console.warn('[SessionWatcher] Supabase client appears frozen — reloading.');
        window.location.reload();
      }, HEALTH_CHECK_TIMEOUT_MS);

      supabase.auth.getSession()
        .catch(() => {
          // errors are fine (e.g. expired session) — only a *hang* is the problem
        })
        .finally(() => {
          settled = true;
          clearTimeout(timeoutId);
          checking = false;
        });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return null;
}