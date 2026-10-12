'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Pin, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { can, GLOBAL_ROLES } from '@/app/lib/permissions';

// Announcements box for the top of both overviews (db/031). Pinned first,
// then newest. Shows the first few; "Show all" expands the rest. Which
// announcements arrive (branch, expiry) is decided by the database; expired
// ones that editors can still see are left out here.

const FIRST = 3;

export const todayManila = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export function postedLabel(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}

export default function AnnouncementsBanner({ manageHref }) {
  const { role } = useAuth();
  const { dark } = useTheme();
  const [items, setItems] = useState(null);       // null = loading
  const [branches, setBranches] = useState({});
  const [ministryNames, setMinistryNames] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState(null);     // expanded long message

  const showBranch = GLOBAL_ROLES.includes(role);
  const canEdit = can(role || 'member', 'announcements', 'edit');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, church_id, ministry_id, title, body, is_pinned, expires_on, created_at')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30);
      if (cancelled) return;
      const today = todayManila();
      const list = error ? [] : (data || []).filter((a) => !a.expires_on || a.expires_on >= today);
      setItems(list);
      if (list.some((a) => a.ministry_id)) {
        const { data: mins } = await supabase.from('ministries').select('id, name');
        if (!cancelled) setMinistryNames(Object.fromEntries((mins || []).map((m) => [m.id, m.name])));
      }
      if (showBranch) {
        const { data: ch } = await supabase.from('churches').select('id, name');
        if (!cancelled) setBranches(Object.fromEntries((ch || []).map((c) => [c.id, c.name])));
      }
    })();
    return () => { cancelled = true; };
  }, [showBranch]);

  const t = dark
    ? { card: 'bg-[#1b2420] border-[#c5a66a]/30', title: 'text-white', body: 'text-[#b6bab6]', muted: 'text-[#858b87]',
        item: 'border-white/10', icon: 'bg-[#c5a66a]/15 text-[#c5a66a]', link: 'text-[#c5a66a] hover:text-[#dcc88f]' }
    : { card: 'bg-white border-[#c5a66a]/45', title: 'text-[#173f35]', body: 'text-[#4c534f]', muted: 'text-[#858b87]',
        item: 'border-[#efede4]', icon: 'bg-[#c5a66a]/15 text-[#9c7f45]', link: 'text-[#9c7f45] hover:text-[#7a6234]' };

  // Nothing to say and nothing to manage → stay out of the way.
  if (items !== null && items.length === 0 && !canEdit) return null;

  const shown = items ? (showAll ? items : items.slice(0, FIRST)) : [];

  return (
    <section aria-label="Announcements" className={`relative overflow-hidden rounded-3xl border p-5 sm:p-6 shadow-sm ${t.card}`}>
      <span className="absolute inset-y-0 left-0 w-1.5 bg-[#c5a66a]" aria-hidden="true" />

      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className={`flex items-center gap-2.5 font-bold text-base ${t.title}`}>
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${t.icon}`}>
            <Megaphone size={16} strokeWidth={1.75} />
          </span>
          Announcements
        </h2>
        {canEdit && manageHref && (
          <Link href={manageHref} className={`inline-flex items-center gap-1.5 text-xs font-semibold ${t.link}`}>
            <Settings2 size={13} /> Manage
          </Link>
        )}
      </div>

      {items === null ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
      ) : items.length === 0 ? (
        <p className={`text-sm ${t.muted}`}>No announcements right now.</p>
      ) : (
        <ul>
          {shown.map((a, i) => {
            const long = (a.body || '').length > 180;
            const open = openId === a.id;
            return (
              <li key={a.id} className={`py-3 ${i ? `border-t ${t.item}` : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm font-bold ${t.title} flex items-center gap-1.5`}>
                    {a.is_pinned && <Pin size={13} className="text-[#c5a66a] shrink-0" aria-label="Pinned" />}
                    {a.title}
                  </p>
                  <span className={`text-[11px] shrink-0 ${t.muted}`}>{postedLabel(a.created_at)}</span>
                </div>
                {a.body && (
                  <p className={`text-sm mt-1 leading-relaxed whitespace-pre-wrap ${t.body} ${long && !open ? 'line-clamp-2' : ''}`}>{a.body}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  {long && (
                    <button onClick={() => setOpenId(open ? null : a.id)} className={`text-xs font-semibold ${t.link}`}>
                      {open ? 'Show less' : 'Read more'}
                    </button>
                  )}
                  {a.ministry_id ? (
                    <span className={`text-[11px] ${t.muted}`}>For {ministryNames[a.ministry_id] || 'your ministry'} members</span>
                  ) : showBranch && (
                    <span className={`text-[11px] ${t.muted}`}>{a.church_id ? branches[a.church_id] || 'One branch' : 'All branches'}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items && items.length > FIRST && (
        <button onClick={() => setShowAll((v) => !v)} className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${t.link}`}>
          {showAll ? <>Show fewer <ChevronUp size={14} /></> : <>Show all {items.length} <ChevronDown size={14} /></>}
        </button>
      )}
    </section>
  );
}
