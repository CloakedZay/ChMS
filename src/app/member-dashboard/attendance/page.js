'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck2 } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useTheme } from '@/app/context/ThemeContext';
import Pagination, { usePaged } from '@/app/components/Pagination';
import AttendanceSheet, { AttendanceEventList, attendanceTheme, eventDate } from '@/app/components/AttendanceSheet';

// A member's own event attendance (db/041). Attendance helpers — members
// the Pastor or Secretary chose — also take attendance here for their
// branch's events.

export default function MemberAttendancePage() {
  const { dark } = useTheme();
  const t = attendanceTheme(dark);
  const [mine, setMine] = useState(null);
  const [helper, setHelper] = useState(false);
  const [tab, setTab] = useState('mine');
  const [events, setEvents] = useState(null);
  const [eventId, setEventId] = useState(null);

  useEffect(() => {
    supabase.rpc('my_attendance').then(({ data }) => setMine(data || []));
    supabase.rpc('am_i_attendance_helper').then(({ data }) => {
      setHelper(!!data);
      if (data) setTab('take');
    });
  }, []);

  useEffect(() => {
    if (tab !== 'take' || eventId) return;
    supabase.rpc('attendance_events', { p_church: null }).then(({ data }) => setEvents(data || []));
  }, [tab, eventId]);

  const thisYear = String(new Date().getFullYear());
  const yearCount = (mine || []).filter((e) => e.date?.startsWith(thisYear)).length;
  const pgMine = usePaged(mine || [], 10);
  const pgEvents = usePaged(events || [], 9);

  if (eventId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
        <AttendanceSheet eventId={eventId} dark={dark} onBack={() => { setEventId(null); setEvents(null); }} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="mb-6">
        <h1 className={`text-2xl font-black ${t.text}`}>Attendance</h1>
        <p className={`text-sm mt-1 ${t.sub}`}>
          {helper ? 'Take attendance for your branch’s events, and see the events you attended.' : 'The church events you attended.'}
        </p>
      </div>

      {helper && (
        <div className={`flex gap-1 p-1 rounded-2xl border w-fit mb-6 ${t.card}`} role="tablist">
          {[['take', 'Take attendance'], ['mine', 'My attendance']].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`px-4 h-9 rounded-xl text-sm font-semibold ${tab === key ? t.tabOn : t.tabOff}`}>{label}</button>
          ))}
        </div>
      )}

      {tab === 'take' && helper ? (
        <>
          <AttendanceEventList t={t} events={events === null ? null : pgEvents.items} onOpen={(id) => { setEventId(id); window.scrollTo(0, 0); }} />
          {events !== null && events.length > 0 && <Pagination {...pgEvents} label="events" />}
        </>
      ) : (
        <>
          <div className={`border rounded-3xl p-5 mb-5 flex items-center gap-4 ${t.card}`}>
            <span className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center"><CalendarCheck2 size={22} /></span>
            <div>
              <p className={`text-2xl font-black ${t.text}`}>{mine === null ? '…' : yearCount}</p>
              <p className={`text-xs ${t.muted}`}>Events attended in {thisYear}</p>
            </div>
          </div>

          {mine === null ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-2xl" />)}</div>
          ) : mine.length === 0 ? (
            <div className={`border border-dashed rounded-3xl p-10 text-center ${t.card}`}>
              <p className={`font-bold ${t.text}`}>No attendance recorded yet</p>
              <p className={`text-sm mt-1 ${t.sub}`}>When you sign the attendance sheet at a church event, it shows up here.</p>
            </div>
          ) : (
            <>
              <ul className={`border rounded-3xl divide-y ${t.card} ${t.divider}`}>
                {pgMine.items.map((e) => (
                  <li key={e.event_id} className="px-5 py-3.5 flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold truncate ${t.text}`}>{e.title}</span>
                      <span className={`block text-xs ${t.muted}`}>{[eventDate(e.date), e.ministry].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500">Attended</span>
                  </li>
                ))}
              </ul>
              <Pagination {...pgMine} label="events" />
            </>
          )}
        </>
      )}
    </div>
  );
}
