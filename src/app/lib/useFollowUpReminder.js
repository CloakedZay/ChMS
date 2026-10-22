'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';

// Follow-up reminder for staff who can follow up members (Pastor, Leader,
// Secretary — see lib/permissions.js "followUp"; never members). Reads
// followup_due() (db/033, db/046): members not seen for REMINDER_DAYS days,
// who missed their last MISSED_EVENTS events, or marked inactive, with no
// follow-up logged in that time.
//
// Refreshes when the tab regains focus, every 15 minutes, and when the
// Follow-up page fires 'faithsync-followup-changed'.
//
// "Remind me tomorrow" hides the reminder (not the sidebar count) until the
// next day, per person on this browser.

// Also the Follow-up page's default "Not seen in".
export const REMINDER_DAYS = 7;
// Events in a row a member may miss before they're flagged; the database's
// followup_due() uses the same default (db/046).
export const MISSED_EVENTS = 3;
const snoozeKey = (userId) => `faithsync-followup-snooze-${userId}`;
const todayManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export function notifyFollowUpChanged() {
  window.dispatchEvent(new Event('faithsync-followup-changed'));
}

export function useFollowUpReminder(userId, enabled = true) {
  const [due, setDue] = useState([]);          // [{ member_id, full_name, last_seen, member_status }]
  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;

    async function refresh() {
      const { data, error } = await supabase.rpc('followup_due', { away_days: REMINDER_DAYS });
      if (!cancelled) setDue(error ? [] : data || []);   // not set up yet → no reminder
      try {
        if (!cancelled) setSnoozed(localStorage.getItem(snoozeKey(userId)) === todayManila());
      } catch { /* storage blocked — just show it */ }
    }

    refresh();
    const timer = setInterval(refresh, 15 * 60 * 1000);
    window.addEventListener('focus', refresh);
    window.addEventListener('faithsync-followup-changed', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('faithsync-followup-changed', refresh);
    };
  }, [userId, enabled]);

  const snooze = useCallback(() => {
    try { localStorage.setItem(snoozeKey(userId), todayManila()); } catch { /* ignore */ }
    setSnoozed(true);
  }, [userId]);

  return { due, count: due.length, snoozed, snooze };
}
