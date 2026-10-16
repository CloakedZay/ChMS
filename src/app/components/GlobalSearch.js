'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2, LayoutGrid, Users, Calendar, Wallet, Megaphone } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { can, canOpenPage } from '@/app/lib/permissions';
import { useDebounced } from '@/app/lib/useDebounced';
import { peso } from '@/app/lib/format';

// The staff dashboard's search: finds pages, members, events, finance
// entries and announcements as you type, grouped, a few of each. A group
// is only asked for when the level may see it (permissions.js), and the
// database rules still decide which rows come back. Picking a result opens
// its page with the search filled in (?q=).
//
// Keyboard: ↑ ↓ move, Enter opens, Esc closes.

const PER_GROUP = 5;
const MIN_CHARS = 2;

// Pages, with the words people might type for them.
const PAGES = [
  { href: '/dashboard/members',       label: 'Members',       words: 'people directory congregation' },
  { href: '/dashboard/follow-up',     label: 'Follow-up',     words: 'inactive visitors absent' },
  { href: '/dashboard/ministry',      label: 'Ministries',    words: 'ministry groups' },
  { href: '/dashboard/users',         label: 'Users',         words: 'logins accounts levels password' },
  { href: '/dashboard/announcements', label: 'Announcements', words: 'news notice post' },
  { href: '/dashboard/events',        label: 'Events',        words: 'calendar schedule service' },
  { href: '/dashboard/attendance',    label: 'Attendance',    words: 'present sign-in sheet visitors' },
  { href: '/dashboard/training',      label: 'Training',      words: 'discipleship modules lessons' },
  { href: '/dashboard/bible-verses',  label: 'Bible Verses',  words: 'verse of the day scripture' },
  { href: '/dashboard/chatbot',       label: 'Assistant',     words: 'ai chatbot documents ask' },
  { href: '/dashboard/journal',       label: 'Journal',       words: 'devotional diary' },
  { href: '/dashboard/finance',       label: 'Finance',       words: 'ledger tithe offering expense funds spending requests' },
  { href: '/dashboard/reports',       label: 'Reports',       words: 'analytics pdf summary' },
  { href: '/dashboard/activity',      label: 'Activity',      words: 'change log audit screen time' },
  { href: '/dashboard/messages',      label: 'Messages',      words: 'chat inbox' },
  { href: '/dashboard/profile',       label: 'My Profile',    words: 'account theme birthday' },
];

const GROUPS = [
  { key: 'pages',         title: 'Pages',         icon: LayoutGrid },
  { key: 'members',       title: 'Members',       icon: Users },
  { key: 'events',        title: 'Events',        icon: Calendar },
  { key: 'finance',       title: 'Finance',       icon: Wallet },
  { key: 'announcements', title: 'Announcements', icon: Megaphone },
];

const shortDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
// Characters that mean something in a database pattern or filter list.
const plain = (q) => q.replace(/[%_\\,()*"]/g, ' ').replace(/\s+/g, ' ').trim();

export default function GlobalSearch({ role, t }) {
  const router = useRouter();
  const listId = useId();
  const boxRef = useRef(null);
  const [text, setText]       = useState('');
  const [open, setOpen]       = useState(false);
  const [results, setResults] = useState(null);   // { pages: [...], members: [...], … } or null
  const [searching, setSearching] = useState(false);
  const [active, setActive]   = useState(0);

  const query = useDebounced(text.trim(), 250);
  const ready = query.length >= MIN_CHARS;

  useEffect(() => {
    if (!ready) return;
    let stale = false;
    (async () => {
      setSearching(true);
      const q = query.toLowerCase();
      const safe = plain(query);
      const pages = PAGES
        .filter((p) => canOpenPage(role, p.href) && `${p.label} ${p.words}`.toLowerCase().includes(q))
        .slice(0, PER_GROUP)
        .map((p) => ({ key: p.href, href: p.href, title: p.label, sub: 'Open page' }));

      const none = Promise.resolve({ data: [] });
      const [members, events, finance, announcements] = await Promise.all([
        can(role, 'members')
          ? supabase.rpc('member_list', { p_church: null, p_status: 'all', p_search: query }).order('full_name').limit(PER_GROUP)
          : none,
        can(role, 'events') && safe
          ? supabase.from('events').select('id, title, date, status').ilike('title', `%${safe}%`).order('date', { ascending: false }).limit(PER_GROUP)
          : none,
        can(role, 'finance')
          ? supabase.rpc('ledger_entries', { p_church: null, p_type: null, p_search: query })
              .order('date', { ascending: false, nullsFirst: false }).limit(PER_GROUP)
          : none,
        can(role, 'announcements') && safe
          ? supabase.from('announcements').select('id, title, created_at')
              .or(`title.ilike.*${safe}*,body.ilike.*${safe}*`).order('created_at', { ascending: false }).limit(PER_GROUP)
          : none,
      ]);
      if (stale) return;
      [members, events, finance, announcements].forEach((r) => { if (r.error) console.error(r.error); });

      const link = (path, value) => `${path}?q=${encodeURIComponent(value)}`;
      setResults({
        pages,
        members: (members.data || []).map((m) => ({
          key: `m${m.id}`, href: link('/dashboard/members', m.full_name || query), title: m.full_name,
          sub: [m.login_role || m.role, m.status].filter(Boolean).join(' · '),
        })),
        events: (events.data || []).map((e) => ({
          key: `e${e.id}`, href: link('/dashboard/events', e.title || query), title: e.title,
          sub: [shortDate(e.date), e.status].filter(Boolean).join(' · '),
        })),
        finance: (finance.data || []).map((x) => ({
          key: `f${x.id}`, href: link('/dashboard/finance', query),
          title: `${x.category}${x.member ? ` · ${x.member}` : ''}`,
          sub: `${x.type === 'expense' ? '−' : '+'}${peso(x.amount)} · ${shortDate(x.date)}${x.status === 'Void' ? ' · Void' : ''}`,
        })),
        announcements: (announcements.data || []).map((a) => ({
          key: `a${a.id}`, href: '/dashboard/announcements', title: a.title, sub: shortDate(a.created_at),
        })),
      });
      setActive(0);
      setSearching(false);
    })();
    return () => { stale = true; };
  }, [query, ready, role]);

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const flat = ready && results ? GROUPS.flatMap((g) => results[g.key].map((r) => ({ ...r, group: g.key }))) : [];
  const showPanel = open && text.trim().length >= MIN_CHARS;

  function go(item) {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]); }
  }

  const panelBg = `${t.modalBg} border ${t.modalBorder}`;
  let index = -1;

  return (
    <div ref={boxRef} className="relative flex-1 sm:flex-none">
      <Search className={`absolute left-3 top-2.5 w-4 h-4 ${t.textSub}`} aria-hidden="true" />
      <input
        type="text"
        role="combobox"
        aria-label="Search FaithSync"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && flat[active] ? `${listId}-${active}` : undefined}
        placeholder="Search members, events, finance, pages..."
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={`${t.inputBg} border ${t.inputBorder} rounded-full py-2 pl-9 pr-9 text-sm ${t.inputText} placeholder:text-slate-500 focus:outline-none focus:border-blue-500 w-full sm:w-80 transition-colors`}
      />
      {text && (
        <button aria-label="Clear search" onClick={() => { setText(''); setResults(null); }} className={`absolute right-3 top-2.5 ${t.textSub} hover:text-blue-400 transition-colors`}>
          <X className="w-4 h-4" />
        </button>
      )}

      {showPanel && (
        <div id={listId} role="listbox" aria-label="Search results"
          className={`absolute right-0 mt-2 w-[min(92vw,26rem)] max-h-[70vh] overflow-y-auto rounded-2xl shadow-2xl z-40 ${panelBg}`}>
          {(searching || !results || query !== text.trim()) && !flat.length ? (
            <p className={`flex items-center gap-2 px-4 py-4 text-sm ${t.textSub}`}><Loader2 className="w-4 h-4 animate-spin" /> Searching...</p>
          ) : !flat.length ? (
            <p className={`px-4 py-4 text-sm ${t.textSub}`}>Nothing found for &ldquo;{text.trim()}&rdquo;.</p>
          ) : GROUPS.filter((g) => results[g.key].length).map((g) => (
            <div key={g.key} role="group" aria-label={g.title} className={`py-1.5 border-b last:border-b-0 ${t.divider}`}>
              <p className={`px-4 pt-1.5 pb-1 text-[10px] uppercase tracking-widest font-bold ${t.textSub}`}>{g.title}</p>
              {results[g.key].map((r) => {
                index += 1;
                const i = index;
                const Icon = g.icon;
                return (
                  <div key={r.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                    onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(r); }}
                    className={`mx-1.5 px-3 py-2 rounded-xl flex items-center gap-3 cursor-pointer ${i === active ? (t.menuHover.replace('hover:', '')) : ''}`}>
                    <Icon className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold truncate ${t.textPrimary}`}>{r.title || 'Untitled'}</span>
                      {r.sub && <span className={`block text-xs truncate capitalize ${t.textSub}`}>{r.sub}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
