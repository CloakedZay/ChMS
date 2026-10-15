'use client';

import { useEffect } from 'react';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';

// Signs a person out after IDLE_MINUTES with no mouse, key, touch or scroll
// in any FaithSync tab — so a login left open on a shared church computer
// doesn't stay open. The last activity time is kept in localStorage, so
// working in one tab keeps the other tabs signed in too, and a laptop that
// slept past the limit signs out as soon as it wakes. The dashboards send a
// signed-out person to /login, which says why (IDLE_FLAG).

export const IDLE_MINUTES = 30;
// Set before signing an idle person out, so the login page can explain why.
export const IDLE_FLAG = 'faithsync-idle';
export const IDLE_MESSAGE = `You were signed out after ${IDLE_MINUTES} minutes with no activity. Please sign in again.`;

const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const LAST_ACTIVE_KEY = 'faithsync-last-active';
const CHECK_EVERY_MS = 30 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

// The saved time, 0 if none, or null if the browser blocks localStorage.
function readLastActive() {
  try { return Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0; } catch { return null; }
}

export default function IdleLogout() {
  const { user } = useAuth();
  const signedIn = !!user;
  // Signing in counts as activity, so an old saved time from a past visit
  // never signs out a fresh login.
  const signedInAt = Date.parse(user?.last_sign_in_at || '') || 0;

  useEffect(() => {
    if (!signedIn) return;

    // Activity in this tab. Starts at 0 so a reload of a page left idle
    // still goes by the saved time — except when storage is blocked, where
    // this tab's own clock is all there is.
    let lastActive = readLastActive() === null ? Date.now() : 0;
    let lastSaved = 0;
    let signingOut = false;

    function markActive() {
      lastActive = Date.now();
      // Writing on every scroll event is wasteful; once every 5 s is enough.
      if (lastActive - lastSaved < 5000) return;
      lastSaved = lastActive;
      try { localStorage.setItem(LAST_ACTIVE_KEY, String(lastActive)); } catch {}
    }

    function check() {
      if (signingOut) return;
      const last = Math.max(lastActive, readLastActive() || 0, signedInAt);
      if (Date.now() - last < IDLE_MS) return;
      signingOut = true;
      try { sessionStorage.setItem(IDLE_FLAG, '1'); } catch {}
      supabase.auth.signOut().catch(() => {});
    }

    function onVisible() {
      if (document.visibilityState === 'visible') check();
    }

    // Opening or reloading a page: idle too long already? Else start now.
    check();
    if (!signingOut) markActive();

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, markActive, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, markActive));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [signedIn, signedInAt]);

  return null;
}
