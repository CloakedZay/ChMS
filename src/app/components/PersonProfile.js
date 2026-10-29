'use client';

import { useEffect, useState } from 'react';
import { X, MessageCircle, MapPin, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useTheme } from '@/app/context/ThemeContext';
import { ROLE_LABELS } from '@/app/lib/permissions';
import { levelBadge } from '@/app/lib/roleColors';
import { avatarUrl } from '@/app/lib/avatar';

// A person's profile (db/061): name, level, branch and ministries — only
// for people you can message, and nothing private (no phone, email,
// birthday or status). Opened by tapping a name in Messages or a ministry
// head on the Ministries page. Full screen on a phone, a pop-up otherwise.
//
//   personId   the person's login id
//   onMessage  (id) → open a chat with them; no button when left out
//   onClose    close the profile

const initials = (name) =>
  (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function PersonProfile({ personId, onMessage, onClose }) {
  const { dark } = useTheme();
  const [person, setPerson] = useState(undefined);   // undefined = loading, null = not available
  const [extras, setExtras] = useState(null);         // photo and About me (db/097)

  useEffect(() => {
    let gone = false;
    supabase.rpc('person_profile', { p_id: personId }).then(({ data }) => {
      if (!gone) setPerson(data?.[0] || null);
    });
    supabase.rpc('person_extras', { p_id: personId }).then(({ data }) => {
      if (!gone) setExtras(data?.[0] || null);
    });
    return () => { gone = true; };
  }, [personId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const t = dark
    ? { shell: 'bg-[#1b2420] border-slate-800/60', text: 'text-white', sub: 'text-slate-400', muted: 'text-slate-500',
        avatar: 'bg-blue-600/25 text-blue-300', chip: 'bg-white/5 border-slate-700 text-slate-200', ghost: 'text-slate-400 hover:bg-white/5' }
    : { shell: 'bg-white border-[#e5e3d8]', text: 'text-[#173f35]', sub: 'text-[#4c534f]', muted: 'text-[#858b87]',
        avatar: 'bg-[#e8f0ea] text-[#173f35]', chip: 'bg-[#f8f7f2] border-[#e5e3d8] text-[#252a28]', ghost: 'text-[#4c534f] hover:bg-[#f8f7f2]' };

  const ministries = person?.ministries || [];

  return (
    <div className="fixed inset-0 z-[60] bg-[#0c1311]/60 flex sm:items-center justify-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={person?.display_name ? `${person.display_name}'s profile` : 'Profile'}
        className={`w-full h-full sm:h-auto sm:max-w-sm flex flex-col border sm:rounded-3xl shadow-xl ${t.shell}`}>
        <div className="flex justify-end p-3">
          <button onClick={onClose} aria-label="Close" className={`w-9 h-9 rounded-full flex items-center justify-center ${t.ghost}`}><X size={18} /></button>
        </div>

        {person === undefined ? (
          <div className={`flex-1 flex items-center justify-center py-16 ${t.muted}`}><Loader2 className="animate-spin" size={22} /></div>
        ) : person === null ? (
          <div className="flex-1 px-6 pb-10 text-center">
            <p className={`font-bold ${t.text}`}>Profile not available</p>
            <p className={`text-sm mt-1 ${t.sub}`}>You can see the profiles of people you can message: your branch, the Pastor and the Admins.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="flex flex-col items-center text-center">
              {extras?.avatar_path
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatarUrl(extras.avatar_path)} alt="" className="w-20 h-20 rounded-full object-cover" />
                : (
                  <span className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black ${t.avatar}`}>
                    {initials(person.display_name)}
                  </span>
                )}
              <h2 className={`mt-3 text-xl font-black ${t.text}`}>{person.display_name}</h2>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {person.contact_role && (
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${levelBadge(person.contact_role, dark)}`}>
                    {ROLE_LABELS[person.contact_role] || person.contact_role}
                  </span>
                )}
                {person.branch && (
                  <span className={`text-xs inline-flex items-center gap-1 ${t.sub}`}><MapPin size={12} /> {person.branch}</span>
                )}
              </div>
            </div>

            {extras?.bio && (
              <p className={`mt-4 text-sm text-center whitespace-pre-wrap leading-relaxed ${t.sub}`}>{extras.bio}</p>
            )}

            <div className="mt-6">
              <p className={`text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5 ${t.muted}`}><Users size={12} /> Ministries</p>
              {ministries.length === 0 ? (
                <p className={`text-sm ${t.sub}`}>Not in a ministry yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {ministries.map((m) => (
                    <li key={m.name} className={`text-xs font-semibold px-3 py-1.5 rounded-xl border ${t.chip}`}>
                      {m.name}{m.head && <span className="ml-1.5 text-[10px] font-black uppercase tracking-wider text-[#9c7f45]">Head</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {onMessage && (
              <button onClick={() => onMessage(person.id)}
                className="mt-8 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">
                <MessageCircle size={16} /> Message
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
