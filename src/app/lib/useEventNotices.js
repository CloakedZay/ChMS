'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { collapseSeries } from '@/app/lib/eventSeries';

// Event approval notices (db/042, db/050) for the staff dashboard:
//   pending  Leaders: the Secretary's events waiting for approval
//   reviews  whoever filed events: the Leaders' decisions they haven't
//            dismissed yet (approved, or sent back with a reason)
// Also turns approved events whose date has passed into
// 'done' (complete_past_events). Refreshes when the tab regains focus,
// every 15 minutes, and when the Events page fires
// 'faithsync-events-changed'.
// A weekly event (db/049) is one notice, with `dates` = how many dates.

export function notifyEventsChanged() {
  window.dispatchEvent(new Event('faithsync-events-changed'));
}

export function useEventNotices(userId, role, enabled = true) {
  const [pending, setPending] = useState([]);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;

    async function refresh() {
      await supabase.rpc('complete_past_events');   // not set up yet → ignored
      const [waiting, mine] = await Promise.all([
        role === 'leader'
          ? supabase.from('events').select('*').eq('status', 'pending').order('date')
          : Promise.resolve({ data: [] }),
        supabase.from('events').select('*')
          .eq('created_by', userId).eq('review_seen', false).order('reviewed_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setPending(waiting.error ? [] : collapseSeries(waiting.data || []));
      setReviews(mine.error ? [] : collapseSeries(mine.data || []));   // db/042 not run → no notices
    }

    refresh();
    const timer = setInterval(refresh, 15 * 60 * 1000);
    window.addEventListener('focus', refresh);
    window.addEventListener('faithsync-events-changed', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('faithsync-events-changed', refresh);
    };
  }, [userId, role, enabled]);

  // "Got it" on the Leaders' decisions.
  const dismiss = useCallback(async (ids) => {
    await supabase.rpc('mark_event_reviews_seen', { p_ids: ids || null });
    setReviews((list) => (ids ? list.filter((r) => !r.ids.some((id) => ids.includes(id))) : []));
    notifyEventsChanged();
  }, []);

  return { pending, reviews, count: pending.length + reviews.length, dismiss };
}
