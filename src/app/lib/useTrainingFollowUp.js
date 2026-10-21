'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';

// Members behind in training (db/075, training_followup_due): no module
// opened NEVER_STARTED_DAYS after getting a login, or started but quiet for
// STALLED_DAYS with questions left — and no training follow-up in that
// time. For the Pastor and Leaders (lib/permissions.js: "followUp" and
// "moduleProgress"); the Admin can read the list but not log follow-ups.
//
// Refreshes when the tab regains focus, every 15 minutes, and when a
// training follow-up is logged ('faithsync-training-followup-changed').

export const NEVER_STARTED_DAYS = 14;
export const STALLED_DAYS = 30;

export function notifyTrainingFollowUpChanged() {
  window.dispatchEvent(new Event('faithsync-training-followup-changed'));
}

export function useTrainingFollowUp(enabled = true) {
  const [due, setDue] = useState(null);        // null while loading; [] if not set up
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('training_followup_due', {
      never_days: NEVER_STARTED_DAYS,
      stalled_days: STALLED_DAYS,
    });
    if (err) {
      setError(/does not exist|schema cache|Could not find/i.test(err.message)
        ? 'Training follow-up has not been set up yet. Ask the administrator to run db/075_training_followup.sql.'
        : err.message);
      setDue([]);
      return;
    }
    setError('');
    setDue(data || []);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = () => { if (!cancelled) refresh(); };

    run();
    const timer = setInterval(run, 15 * 60 * 1000);
    window.addEventListener('focus', run);
    window.addEventListener('faithsync-training-followup-changed', run);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', run);
      window.removeEventListener('faithsync-training-followup-changed', run);
    };
  }, [enabled, refresh]);

  return { due: due || [], loading: enabled && due === null, count: due?.length || 0, error, refresh };
}
