'use client';

import { useEffect } from 'react';
import { supabase } from '@/app/lib/supabase';

// Events need no approval any more (db/085): Leaders add them and they are
// Upcoming at once. What's left here:
//   notifyEventsChanged()   the Events page tells open pages to reload
//   useCompletePastEvents   turns Upcoming events whose date has passed into
//                           Done (complete_past_events, db/042), once when the
//                           staff dashboard opens and when the tab regains
//                           focus, so members see them as Done too.

export function notifyEventsChanged() {
  window.dispatchEvent(new Event('faithsync-events-changed'));
}

export function useCompletePastEvents(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => { supabase.rpc('complete_past_events').then(() => {}, () => {}); };
    run();
    window.addEventListener('focus', run);
    return () => window.removeEventListener('focus', run);
  }, [enabled]);
}
