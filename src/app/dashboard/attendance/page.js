'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import BranchLabel from '@/app/components/BranchLabel';
import Pagination, { usePaged } from '@/app/components/Pagination';
import AttendanceSheet, { AttendanceEventList, attendanceTheme } from '@/app/components/AttendanceSheet';

import { friendlyError } from '@/app/lib/errors';
// Event attendance (db/041). The list of events to take attendance for;
// opening one shows its sheet. /dashboard/attendance?event=12 opens that
// event directly (the Events page links here).

const GLOBAL_ROLES = ['admin', 'pastor'];

async function fetchEvents(branch) {
  const { data, error } = await supabase.rpc('attendance_events', { p_church: branch || null });
  if (!error) return { events: data || [], error: '' };
  return {
    events: [],
    error: /does not exist|schema cache|Could not find/i.test(error.message)
      ? 'Attendance has not been set up yet. Ask the administrator to run db/041_event_attendance.sql.'
      : friendlyError(error),
  };
}

export default function AttendancePage() {
  return <Suspense fallback={null}><Attendance /></Suspense>;
}

function Attendance() {
  const params = useSearchParams();
  const { role } = useAuth();
  const { dark } = useTheme();
  const t = attendanceTheme(dark);
  const isGlobal = GLOBAL_ROLES.includes(role);

  const [eventId, setEventId] = useState(() => Number(params.get('event')) || null);
  const [events, setEvents] = useState(null);
  const [churches, setChurches] = useState([]);
  const [branch, setBranch] = useState('');
  const [error, setError] = useState('');

  // Sign-in sheet photos are kept 6 months after the event (db/060): the
  // database drops the expired entries this person may remove and returns
  // their files, which are deleted here.
  useEffect(() => {
    supabase.rpc('purge_old_sheet_photos').then(({ data }) => {
      if (data?.length) supabase.storage.from('attendance-sheets').remove(data);
    });
  }, []);

  useEffect(() => {
    if (!isGlobal) return;
    supabase.from('churches').select('id, name').order('name').then(({ data }) => setChurches(data || []));
  }, [isGlobal]);

  useEffect(() => {
    if (eventId) return;
    let gone = false;
    fetchEvents(branch).then((r) => { if (!gone) { setEvents(r.events); setError(r.error); } });
    return () => { gone = true; };
  }, [eventId, branch]);

  function open(id) {
    setEventId(id);
    window.history.replaceState(null, '', `/dashboard/attendance?event=${id}`);
    window.scrollTo(0, 0);
  }
  function back() {
    setEventId(null);
    setEvents(null);
    window.history.replaceState(null, '', '/dashboard/attendance');
  }

  const pg = usePaged(events || [], 9, branch);
  const nameOf = (id) => (isGlobal && !branch ? churches.find((c) => c.id === id)?.name : '');

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-screen ${dark ? 'bg-[#111815]' : 'bg-[#f8f7f2]'}`}>
      {eventId ? (
        <AttendanceSheet eventId={eventId} dark={dark} onBack={back} />
      ) : (
        <>
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <p className={`text-[10px] uppercase tracking-widest ${t.muted} mb-1`}><BranchLabel /></p>
              <h1 className={`text-2xl font-black ${t.text}`}>Attendance</h1>
              <p className={`text-sm mt-1 ${t.sub} max-w-2xl`}>
                After an event, tick the members who signed the attendance sheet and add the visitors.
              </p>
            </div>
            {isGlobal && (
              <label className="flex items-center gap-2">
                <span className={`text-[10px] uppercase tracking-widest font-bold ${t.sub}`}>Branch</span>
                <select value={branch} onChange={(e) => { setBranch(e.target.value); setEvents(null); }}
                  className={`border rounded-xl px-3 h-10 text-sm ${t.input}`}>
                  <option value="">All branches</option>
                  {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
          </div>

          {error && <p className="mb-6 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>}

          <AttendanceEventList t={t} events={events === null ? null : pg.items} churchName={nameOf} onOpen={open} />
          {events !== null && events.length > 0 && <Pagination {...pg} label="events" />}
        </>
      )}
    </div>
  );
}
