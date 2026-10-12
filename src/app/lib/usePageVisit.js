'use client';

import { useEffect } from 'react';
import { supabase } from '@/app/lib/supabase';

// Screen time (db/011). Adds a page_visits row when a page opens, then
// saves the seconds the tab was visible every 30s, when the tab is hidden,
// and when the person leaves the page. The database fills in who / branch /
// level / start time and caps seconds at the real time since the visit
// started, so this only reports the page and the visible time.

const SAVE_EVERY_MS = 30_000;

export function usePageVisit(userId, path, enabled) {
  useEffect(() => {
    if (!enabled || !userId || !path) return;

    let visitId = null;
    let savedSeconds = 0;
    let visibleMs = 0;
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : null;

    const seconds = () =>
      Math.round((visibleMs + (visibleSince ? Date.now() - visibleSince : 0)) / 1000);

    function save() {
      const s = seconds();
      if (!visitId || s <= savedSeconds) return;
      savedSeconds = s;
      supabase.from('page_visits').update({ seconds: s }).eq('id', visitId)
        .then(({ error }) => { if (error) console.warn('Screen time not saved:', error.message); });
    }

    supabase.from('page_visits').insert({ path }).select('id').single()
      .then(({ data, error }) => {
        if (error) console.warn('Screen time not started:', error.message);
        else visitId = data.id;
      });

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        if (visibleSince) visibleMs += Date.now() - visibleSince;
        visibleSince = null;
        save();
      } else if (!visibleSince) {
        visibleSince = Date.now();
      }
    }

    const timer = setInterval(save, SAVE_EVERY_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      save();
    };
  }, [userId, path, enabled]);
}
