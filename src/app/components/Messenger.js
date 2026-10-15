'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, MessageCircle, Plus, Search, Send, X, Check, CheckCheck, Loader2, Users, LogOut, Pencil,
} from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { useTheme } from '@/app/context/ThemeContext';
import { ROLE_LABELS } from '@/app/lib/permissions';
import { levelBadge } from '@/app/lib/roleColors';
import { confirmDialog } from '@/app/lib/dialog';
import PersonProfile from '@/app/components/PersonProfile';

import { friendlyError } from '@/app/lib/errors';
// Chat for both dashboards: one-to-one (db/029) and groups (db/030).
// Chats are private to the people in them. Who can be added or messaged is
// decided by the database (chat_contacts: your own church, plus every Admin
// and Pastor).

const MAX_LEN = 2000;
const THREAD_LIMIT = 200;
const RECENT_MAX = 8;   // people remembered in the new-chat list, this device only

const manilaDay = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(iso));
const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const dayLabel = (iso) => {
  const d = manilaDay(iso);
  if (d === manilaDay(new Date().toISOString())) return 'Today';
  if (d === manilaDay(new Date(Date.now() - 86400000).toISOString())) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
};
const listTime = (iso) => (manilaDay(iso) === manilaDay(new Date().toISOString())
  ? clock(iso)
  : new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }));
const initials = (name) =>
  (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const isMissing = (msg) => /does not exist|schema cache|Could not find/i.test(msg || '');

function Avatar({ t, name, group, size = 'w-10 h-10 text-sm' }) {
  return (
    <span className={`${size} rounded-full flex items-center justify-center font-bold shrink-0 ${t.avatar}`}>
      {group ? <Users size={18} strokeWidth={1.75} /> : initials(name)}
    </span>
  );
}

function RoleChip({ t, role }) {
  if (!role) return null;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${levelBadge(role, t.dark)}`}>{ROLE_LABELS[role] || role}</span>;
}

// A tick-box row for choosing people.
function PickRow({ t, person, checked, onToggle }) {
  return (
    <li>
      <button type="button" onClick={onToggle} aria-pressed={checked}
        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 ${t.row}`}>
        <Avatar t={t} name={person.display_name} size="w-9 h-9 text-xs" />
        <span className={`text-sm font-semibold flex-1 truncate ${t.text}`}>{person.display_name}</span>
        <RoleChip t={t} role={person.contact_role} />
        <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600 border-blue-600 text-white' : t.box}`}>
          {checked && <Check size={13} strokeWidth={3} />}
        </span>
      </button>
    </li>
  );
}

export default function Messenger() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const me = user?.id;

  const [dms, setDms]               = useState(null);   // null = loading
  const [groups, setGroups]         = useState(null);
  const [groupsReady, setGroupsReady] = useState(true);  // false until db/030 is run
  const [contacts, setContacts]     = useState([]);
  const [setupError, setSetupError] = useState('');
  const [active, setActive]         = useState(null);   // { kind: 'dm' | 'group', id }
  const [thread, setThread]         = useState([]);
  const [members, setMembers]       = useState([]);     // of the open group
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft]           = useState('');
  const [sending, setSending]       = useState(false);
  const [sendError, setSendError]   = useState('');
  const [listSearch, setListSearch] = useState('');

  const [picker, setPicker]         = useState(null);   // null | 'direct' | 'group'
  const [query, setQuery]           = useState('');
  const [groupName, setGroupName]   = useState('');
  const [selected, setSelected]     = useState([]);
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState('');

  const [info, setInfo]             = useState(false);  // group details dialog
  const [renameVal, setRenameVal]   = useState('');
  const [addQuery, setAddQuery]     = useState('');
  const [addSel, setAddSel]         = useState([]);
  const [infoBusy, setInfoBusy]     = useState(false);
  const [infoError, setInfoError]   = useState('');
  const [profileId, setProfileId]   = useState(null);   // whose profile is open (db/061)
  const [recentIds, setRecentIds]   = useState([]);     // people picked lately, newest first

  const activeRef = useRef(null);
  const membersRef = useRef([]);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  // Keep the latest values where the realtime handlers can read them.
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { membersRef.current = members; }, [members]);

  const t = dark
    ? {
        dark: true,
        shell: 'bg-[#1b2420] border-slate-800/60', pane: 'border-slate-800', text: 'text-white', sub: 'text-slate-400',
        muted: 'text-slate-500', input: 'bg-[#111815] border-slate-700 text-slate-100 placeholder:text-slate-500',
        row: 'hover:bg-white/5', rowActive: 'bg-white/10', mine: 'bg-blue-600 text-white',
        theirs: 'bg-[#26312c] text-slate-100', chip: 'bg-blue-500/15 text-blue-300', avatar: 'bg-blue-600/25 text-blue-300',
        ghost: 'text-slate-400 hover:bg-white/5', page: 'bg-[#111815]', sep: 'text-slate-500', box: 'border-slate-600',
        tabOn: 'bg-white/10 text-white', tabOff: 'text-slate-400 hover:text-white',
      }
    : {
        dark: false,
        shell: 'bg-white border-[#e5e3d8]', pane: 'border-[#efede4]', text: 'text-[#173f35]', sub: 'text-[#4c534f]',
        muted: 'text-[#858b87]', input: 'bg-white border-[#d9d6c8] text-[#252a28] placeholder:text-[#858b87]',
        row: 'hover:bg-[#f8f7f2]', rowActive: 'bg-[#e8f0ea]', mine: 'bg-blue-600 text-white',
        theirs: 'bg-[#f1efe7] text-[#252a28]', chip: 'bg-[#e8f0ea] text-[#173f35]', avatar: 'bg-[#e8f0ea] text-[#173f35]',
        ghost: 'text-[#4c534f] hover:bg-[#f8f7f2]', page: 'bg-[#f8f7f2]', sep: 'text-[#858b87]', box: 'border-[#cfcdc2]',
        tabOn: 'bg-[#e8f0ea] text-[#173f35]', tabOff: 'text-[#858b87] hover:text-[#173f35]',
      };

  const sameActive = (a, kind, id) => !!a && a.kind === kind && a.id === id;

  // ── Data ────────────────────────────────────────────────────────────────
  const loadConvos = useCallback(async () => {
    const [d, g] = await Promise.all([supabase.rpc('my_conversations'), supabase.rpc('my_groups')]);
    if (d.error) {
      setSetupError(isMissing(d.error.message)
        ? 'Messages have not been set up yet. Ask the administrator to run db/029_messages.sql.'
        : friendlyError(d.error));
      setDms([]);
    } else {
      setSetupError('');
      setDms(d.data || []);
    }
    if (g.error) {
      setGroupsReady(!isMissing(g.error.message) ? true : false);
      setGroups([]);
    } else {
      setGroupsReady(true);
      setGroups(g.data || []);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    const [{ data }, { data: mins }] = await Promise.all([
      supabase.from('chat_contacts').select('id, display_name, contact_role').order('display_name'),
      supabase.rpc('contact_ministries'),   // empty before db/061
    ]);
    // Ministry names per person, so the picker can search by ministry.
    const minsOf = new Map((mins || []).map((r) => [r.person_id, (r.ministries || []).map((m) => m.name)]));
    setContacts((data || []).map((c) => ({ ...c, ministries: minsOf.get(c.id) || [] })));
  }, []);

  const loadMembers = useCallback(async (gid) => {
    const { data } = await supabase.rpc('group_members', { gid });
    if (sameActive(activeRef.current, 'group', gid)) setMembers(data || []);
    return data || [];
  }, []);

  const markRead = useCallback(async (kind, id) => {
    if (kind === 'dm') {
      await supabase.rpc('mark_conversation_read', { other: id });
      setDms((list) => (list || []).map((c) => (c.other_id === id ? { ...c, unread: 0 } : c)));
    } else {
      await supabase.rpc('mark_group_read', { gid: id });
      setGroups((list) => (list || []).map((c) => (c.group_id === id ? { ...c, unread: 0 } : c)));
    }
    window.dispatchEvent(new Event('faithsync-messages-read'));
  }, []);

  const openThread = useCallback(async (kind, id) => {
    setActive({ kind, id });
    activeRef.current = { kind, id };
    setPicker(null);
    setInfo(false);
    setSendError('');
    setThread([]);
    setMembers([]);
    setThreadLoading(true);

    let rows = [];
    if (kind === 'dm') {
      const { data } = await supabase
        .from('messages')
        .select('id, sender_id, recipient_id, body, created_at, read_at')
        .or(`and(sender_id.eq.${me},recipient_id.eq.${id}),and(sender_id.eq.${id},recipient_id.eq.${me})`)
        .order('created_at', { ascending: false })
        .limit(THREAD_LIMIT);
      rows = data || [];
    } else {
      const [msgs] = await Promise.all([
        supabase.from('group_messages')
          .select('id, sender_id, body, created_at')
          .eq('group_id', id)
          .order('created_at', { ascending: false })
          .limit(THREAD_LIMIT),
        loadMembers(id),
      ]);
      rows = msgs.data || [];
    }
    if (!sameActive(activeRef.current, kind, id)) return;    // switched away while loading
    setThread(rows.slice().reverse());
    setThreadLoading(false);
    markRead(kind, id);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [me, markRead, loadMembers]);

  useEffect(() => { if (me) { loadConvos(); loadContacts(); } }, [me, loadConvos, loadContacts]);

  // ?to=<id> opens a chat with that person (the profile's Message button
  // on other pages links here).
  useEffect(() => {
    if (!me) return;
    const to = new URLSearchParams(window.location.search).get('to');
    if (!to) return;
    window.history.replaceState(null, '', window.location.pathname);
    Promise.resolve().then(() => openThread('dm', to));
  }, [me, openThread]);

  // Live: new messages (direct + group), and the other person reading mine.
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`messenger-${me}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${me}` },
        (payload) => {
          const msg = payload.new;
          if (sameActive(activeRef.current, 'dm', msg.sender_id)) {
            setThread((list) => (list.some((m) => m.id === msg.id) ? list : [...list, msg]));
            markRead('dm', msg.sender_id);
          }
          loadConvos();
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` },
        (payload) => {
          const msg = payload.new;
          setThread((list) => list.map((m) => (m.id === msg.id ? { ...m, read_at: msg.read_at } : m)));
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages' },   // RLS: only my groups arrive
        (payload) => {
          const msg = payload.new;
          if (sameActive(activeRef.current, 'group', msg.group_id)) {
            setThread((list) => (list.some((m) => m.id === msg.id) ? list : [...list, msg]));
            if (msg.sender_id !== me) markRead('group', msg.group_id);
            if (!membersRef.current.some((m) => m.user_id === msg.sender_id)) loadMembers(msg.group_id);
          }
          loadConvos();
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [me, loadConvos, markRead, loadMembers]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread, active]);

  // ── Sending ─────────────────────────────────────────────────────────────
  async function send() {
    const body = draft.trim();
    if (!body || sending || !active) return;
    setSending(true);
    setSendError('');
    const { data, error } = active.kind === 'dm'
      ? await supabase.from('messages').insert([{ recipient_id: active.id, body }])
          .select('id, sender_id, recipient_id, body, created_at, read_at').single()
      : await supabase.from('group_messages').insert([{ group_id: active.id, body }])
          .select('id, sender_id, body, created_at').single();
    setSending(false);
    if (error) { setSendError(friendlyError(error)); return; }
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setThread((list) => (list.some((m) => m.id === data.id) ? list : [...list, data]));
    loadConvos();
    inputRef.current?.focus();
  }
  function onKeyDown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }
  function onInput(e) {
    setDraft(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
  }

  // ── Groups ──────────────────────────────────────────────────────────────
  // Recent people live in this browser only (a convenience, not shared).
  const recentKey = `faithsync-recent-people-${me}`;
  function readRecent() {
    try { return JSON.parse(localStorage.getItem(recentKey) || '[]'); } catch { return []; }
  }
  function saveRecent(ids) {
    setRecentIds(ids);
    try { localStorage.setItem(recentKey, JSON.stringify(ids)); } catch { /* storage off: keep it for now */ }
  }
  const remember = (id) => saveRecent([id, ...recentIds.filter((x) => x !== id)].slice(0, RECENT_MAX));

  function openPicker(tab) {
    setPicker(tab); setQuery(''); setGroupName(''); setSelected([]); setCreateError('');
    setRecentIds(readRecent());
  }
  const toggle = (list, setList, id) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function createGroup() {
    setCreating(true);
    setCreateError('');
    const { data, error } = await supabase.rpc('create_chat_group', { group_name: groupName.trim(), member_ids: selected });
    setCreating(false);
    if (error) { setCreateError(friendlyError(error)); return; }
    await loadConvos();
    openThread('group', data);
  }

  function openInfo() {
    setRenameVal(activeItem?.name || '');
    setAddQuery(''); setAddSel([]); setInfoError('');
    setInfo(true);
    loadMembers(active.id);
  }

  async function runInfo(fn) {
    setInfoBusy(true);
    setInfoError('');
    const { error } = await fn();
    setInfoBusy(false);
    if (error) { setInfoError(friendlyError(error)); return false; }
    return true;
  }
  async function saveRename() {
    if (!renameVal.trim() || renameVal.trim() === activeItem?.name) return;
    if (await runInfo(() => supabase.rpc('rename_chat_group', { gid: active.id, new_name: renameVal.trim() }))) loadConvos();
  }
  async function addPeople() {
    if (!addSel.length) return;
    if (await runInfo(() => supabase.rpc('add_group_members', { gid: active.id, member_ids: addSel }))) {
      setAddSel([]); setAddQuery('');
      loadMembers(active.id);
      loadConvos();
    }
  }
  async function removePerson(person) {
    if (!await confirmDialog(`Remove ${person.display_name} from this group?`)) return;
    if (await runInfo(() => supabase.rpc('remove_group_member', { gid: active.id, member: person.user_id }))) {
      loadMembers(active.id);
      loadConvos();
    }
  }
  async function leaveGroup() {
    if (!await confirmDialog(`Leave “${activeItem?.name}”? You will stop receiving its messages.`)) return;
    if (await runInfo(() => supabase.rpc('remove_group_member', { gid: active.id, member: me }))) {
      setInfo(false); setActive(null); setThread([]); setMembers([]);
      loadConvos();
      window.dispatchEvent(new Event('faithsync-messages-read'));
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const items = useMemo(() => {
    const a = (dms || []).map((c) => ({
      kind: 'dm', id: c.other_id, name: c.display_name, role: c.contact_role,
      preview: c.last_body, fromMe: c.last_from_me, lastAt: c.last_at, unread: c.unread,
    }));
    const b = (groups || []).map((g) => ({
      kind: 'group', id: g.group_id, name: g.name, count: g.member_count, isOwner: g.is_owner,
      preview: g.last_body, sender: g.last_sender_name, fromMe: g.last_from_me, lastAt: g.last_at, unread: g.unread,
    }));
    return [...a, ...b].sort((x, y) => new Date(y.lastAt) - new Date(x.lastAt));
  }, [dms, groups]);

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const memberName = useMemo(() => new Map(members.map((m) => [m.user_id, m.display_name])), [members]);

  const activeItem = active ? items.find((i) => i.kind === active.kind && i.id === active.id) : null;
  const dmPerson = active?.kind === 'dm' ? (contactById.get(active.id) || null) : null;
  const headerName = active?.kind === 'group' ? (activeItem?.name || 'Group') : (dmPerson?.display_name || activeItem?.name || 'Unknown');
  const headerRole = active?.kind === 'dm' ? (dmPerson?.contact_role || activeItem?.role) : null;
  const canSend = active?.kind === 'group' ? true : !!dmPerson;
  const iAmOwner = active?.kind === 'group' && members.some((m) => m.user_id === me && m.is_owner);

  const needle = listSearch.trim().toLowerCase();
  const shownItems = items.filter((i) => !needle || i.name.toLowerCase().includes(needle));
  const q = query.trim().toLowerCase();
  const matches = (c) => !q || c.display_name.toLowerCase().includes(q) || (ROLE_LABELS[c.contact_role] || '').toLowerCase().includes(q)
    || c.ministries?.some((m) => m.toLowerCase().includes(q));
  // Nobody is listed until something is typed; then everyone whose name,
  // level or ministry has it. Before that: people picked lately, and in a
  // group, who's already ticked.
  const recentPeople = recentIds.map((id) => contactById.get(id)).filter(Boolean);
  const shownContacts = q ? contacts.filter(matches)
    : picker === 'group'
      ? [...contacts.filter((c) => selected.includes(c.id)), ...recentPeople.filter((c) => !selected.includes(c.id))]
      : recentPeople;
  const showingRecent = !q && recentPeople.length > 0;
  const addable = contacts
    .filter((c) => !members.some((m) => m.user_id === c.id))
    .filter((c) => !addQuery.trim() || c.display_name.toLowerCase().includes(addQuery.trim().toLowerCase()));

  const lastMineIndex = (() => {
    if (active?.kind !== 'dm') return -1;
    for (let i = thread.length - 1; i >= 0; i--) if (thread[i].sender_id === me) return i;
    return -1;
  })();

  const field = `w-full border rounded-full pl-9 pr-3 py-2 text-sm ${t.input}`;
  const modalShell = `w-full sm:max-w-md max-h-[85vh] flex flex-col border rounded-t-3xl sm:rounded-3xl shadow-xl ${t.shell}`;
  const backdrop = 'fixed inset-0 z-50 bg-[#0c1311]/60 flex items-end sm:items-center justify-center sm:p-4';

  return (
    <div className={`p-4 sm:p-6 lg:p-8 min-h-[calc(100dvh-4rem)] ${t.page}`}>
      <div className="mb-5">
        <h1 className={`text-2xl font-black ${t.text}`}>Messages</h1>
        <p className={`text-sm mt-1 ${t.sub}`}>Private chats and groups. Only the people in a chat can read it.</p>
      </div>

      {setupError && (
        <p className="mb-5 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{setupError}</p>
      )}

      <div className={`border rounded-3xl overflow-hidden flex h-[calc(100dvh-12rem)] min-h-[26rem] ${t.shell}`}>

        {/* ── Left: chats ─────────────────────────────────────────────── */}
        <aside className={`${active ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 shrink-0 flex-col border-r ${t.pane}`}>
          <div className={`p-4 border-b ${t.pane} flex items-center gap-2`}>
            <div className="relative flex-1">
              <Search size={15} className={`absolute left-3 top-3 ${t.muted}`} />
              <input type="text" value={listSearch} onChange={(e) => setListSearch(e.target.value)}
                placeholder="Search chats" aria-label="Search chats" className={field} />
            </div>
            <button onClick={() => openPicker('direct')} title="New message or group" aria-label="New message or group"
              className="w-10 h-10 shrink-0 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center">
              <Plus size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {dms === null && groups === null ? (
              <div className="p-4 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14 w-full" />)}</div>
            ) : shownItems.length === 0 ? (
              <div className="p-8 text-center">
                <span className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${t.chip}`}>
                  <MessageCircle size={22} strokeWidth={1.5} />
                </span>
                <p className={`text-sm font-semibold ${t.text}`}>{listSearch ? 'No chats match' : 'No chats yet'}</p>
                {!listSearch && <p className={`text-xs mt-1 ${t.sub}`}>Press + to message someone or start a group.</p>}
              </div>
            ) : (
              <ul>
                {shownItems.map((c) => (
                  <li key={`${c.kind}:${c.id}`}>
                    <button onClick={() => openThread(c.kind, c.id)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 ${sameActive(active, c.kind, c.id) ? t.rowActive : t.row}`}>
                      <Avatar t={t} name={c.name} group={c.kind === 'group'} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`text-sm truncate ${c.unread ? 'font-bold' : 'font-semibold'} ${t.text}`}>{c.name}</span>
                          <span className={`text-[11px] shrink-0 ${t.muted}`}>{listTime(c.lastAt)}</span>
                        </span>
                        <span className="flex items-center justify-between gap-2 mt-0.5">
                          <span className={`text-xs truncate ${c.unread ? `font-semibold ${t.text}` : t.sub}`}>
                            {c.preview
                              ? `${c.fromMe ? 'You: ' : c.kind === 'group' && c.sender ? `${c.sender.split(' ')[0]}: ` : ''}${c.preview}`
                              : 'No messages yet'}
                          </span>
                          {c.unread > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#c5a66a] text-[#173f35] text-[11px] font-bold flex items-center justify-center shrink-0">
                              {c.unread > 9 ? '9+' : c.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Right: conversation ─────────────────────────────────────── */}
        <section className={`${active ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col`}>
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <span className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-4 ${t.chip}`}>
                <MessageCircle size={30} strokeWidth={1.5} />
              </span>
              <p className={`font-bold ${t.text}`}>Select a chat</p>
              <p className={`text-sm mt-1 ${t.sub}`}>Choose a conversation, or press + to start a new one.</p>
            </div>
          ) : (
            <>
              <header className={`px-4 py-3 border-b ${t.pane} flex items-center gap-3`}>
                <button onClick={() => setActive(null)} aria-label="Back to chats"
                  className={`md:hidden w-9 h-9 rounded-full flex items-center justify-center ${t.ghost}`}>
                  <ArrowLeft size={18} />
                </button>
                <Avatar t={t} name={headerName} group={active.kind === 'group'} />
                <div className="min-w-0 flex-1">
                  {active.kind === 'dm' && dmPerson ? (
                    <button onClick={() => setProfileId(active.id)} title="See profile"
                      className={`block max-w-full text-left text-sm font-bold truncate hover:underline ${t.text}`}>{headerName}</button>
                  ) : (
                    <p className={`text-sm font-bold truncate ${t.text}`}>{headerName}</p>
                  )}
                  {active.kind === 'group' ? (
                    <button onClick={openInfo} className={`text-xs ${t.sub} hover:underline`}>
                      {activeItem?.count || members.length} member{(activeItem?.count || members.length) === 1 ? '' : 's'} · details
                    </button>
                  ) : (
                    <div className="mt-0.5"><RoleChip t={t} role={headerRole} /></div>
                  )}
                </div>
                {active.kind === 'group' && (
                  <button onClick={openInfo} aria-label="Group details" title="Group details"
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${t.ghost}`}>
                    <Users size={17} strokeWidth={1.75} />
                  </button>
                )}
              </header>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
                {threadLoading ? (
                  <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className={`skeleton h-10 ${i % 2 ? 'w-1/2 ml-auto' : 'w-2/3'}`} />)}</div>
                ) : thread.length === 0 ? (
                  <p className={`text-center text-sm mt-10 ${t.sub}`}>
                    {active.kind === 'group' ? 'No messages yet. Start the conversation.' : `No messages yet. Say hello to ${headerName.split(' ')[0]}.`}
                  </p>
                ) : thread.map((m, i) => {
                  const mine = m.sender_id === me;
                  const prev = thread[i - 1];
                  const newDay = i === 0 || manilaDay(prev.created_at) !== manilaDay(m.created_at);
                  const showSender = active.kind === 'group' && !mine && (newDay || prev.sender_id !== m.sender_id);
                  return (
                    <div key={m.id}>
                      {newDay && <p className={`text-center text-[11px] font-semibold my-3 ${t.sep}`}>{dayLabel(m.created_at)}</p>}
                      {showSender && (
                        <p className={`text-[11px] font-semibold mt-2 mb-0.5 ml-2 ${t.muted}`}>{memberName.get(m.sender_id) || 'Member'}</p>
                      )}
                      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? `${t.mine} rounded-br-md` : `${t.theirs} rounded-bl-md`}`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={`text-[10px] mt-1 text-right ${mine ? 'opacity-70' : t.muted}`}>{clock(m.created_at)}</p>
                        </div>
                      </div>
                      {mine && i === lastMineIndex && (
                        <p className={`text-[11px] text-right mt-0.5 pr-1 flex items-center justify-end gap-1 ${t.muted}`}>
                          {m.read_at ? <><CheckCheck size={12} /> Seen</> : <><Check size={12} /> Sent</>}
                        </p>
                      )}
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className={`p-3 border-t ${t.pane}`}>
                {sendError && <p className="text-xs text-rose-500 mb-2 px-1">{sendError}</p>}
                {!canSend ? (
                  <p className={`text-xs text-center py-2 ${t.sub}`}>You can no longer message this person.</p>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea ref={inputRef} rows={1} value={draft} onChange={onInput} onKeyDown={onKeyDown}
                      maxLength={MAX_LEN} placeholder="Write a message..." aria-label="Message"
                      className={`flex-1 border rounded-2xl px-4 py-2.5 text-sm resize-none max-h-32 ${t.input}`} />
                    <button onClick={send} disabled={sending || !draft.trim()} aria-label="Send message" title="Send (Enter)"
                      className="w-11 h-11 shrink-0 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center justify-center">
                      {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} strokeWidth={1.75} />}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── New message / new group ────────────────────────────────────── */}
      {picker && (
        <div className={backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) setPicker(null); }}>
          <div role="dialog" aria-modal="true" aria-label="New chat" className={modalShell}>
            <div className={`p-4 border-b ${t.pane} flex items-center justify-between`}>
              <h2 className={`font-bold ${t.text}`}>{picker === 'group' ? 'New group' : 'New message'}</h2>
              <button onClick={() => setPicker(null)} aria-label="Close" className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.ghost}`}><X size={18} /></button>
            </div>

            {groupsReady && (
              <div className="px-4 pt-3 flex gap-1" role="tablist">
                {[['direct', 'Direct message'], ['group', 'New group']].map(([key, label]) => (
                  <button key={key} role="tab" aria-selected={picker === key}
                    onClick={() => { setPicker(key); setQuery(''); setCreateError(''); }}
                    className={`flex-1 h-9 rounded-xl text-sm font-semibold ${picker === key ? t.tabOn : t.tabOff}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {picker === 'group' && (
              <div className="px-4 pt-3">
                <label htmlFor="g-name" className={`block text-xs font-semibold mb-1.5 ${t.sub}`}>Group name</label>
                <input id="g-name" type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={60}
                  placeholder="e.g. Youth Ministry team"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm ${t.input}`} />
              </div>
            )}

            <div className="p-4 pb-2">
              <div className="relative">
                <Search size={15} className={`absolute left-3 top-3 ${t.muted}`} />
                <input autoFocus={picker === 'direct'} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type a name, level or ministry" aria-label="Search people" className={field} />
              </div>
              {picker === 'group' && (
                <p className={`text-xs mt-2 ${t.sub}`}>{selected.length} selected</p>
              )}
            </div>

            <ul className="overflow-y-auto pb-3 flex-1">
              {showingRecent && (
                <li className="px-4 pt-1 pb-1.5 flex items-center justify-between">
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${t.muted}`}>{picker === 'group' && selected.length ? 'Selected and recent' : 'Recent'}</span>
                  <button onClick={() => saveRecent([])} className={`text-xs font-semibold ${t.sub} hover:underline`}>Clear</button>
                </li>
              )}
              {shownContacts.length === 0 ? (
                <li className={`px-6 py-8 text-center text-sm ${t.sub}`}>
                  {contacts.length === 0 ? 'There is nobody to message yet.'
                    : !q ? `Start typing to find someone${picker === 'group' ? ' to add' : ''}. For example a name, “leader”, or a ministry.`
                    : `No one matches “${query}”.`}
                </li>
              ) : picker === 'group' ? shownContacts.map((c) => (
                <PickRow key={c.id} t={t} person={c} checked={selected.includes(c.id)}
                  onToggle={() => { if (!selected.includes(c.id)) remember(c.id); toggle(selected, setSelected, c.id); }} />
              )) : shownContacts.map((c) => (
                <li key={c.id} className={`flex items-center gap-1 pr-3 ${t.row}`}>
                  <button onClick={() => { remember(c.id); setProfileId(c.id); }} title="See profile"
                    className="flex-1 min-w-0 text-left flex items-center gap-3 pl-4 py-2.5">
                    <Avatar t={t} name={c.display_name} size="w-9 h-9 text-xs" />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm font-semibold truncate ${t.text}`}>{c.display_name}</span>
                      {c.ministries?.length > 0 && <span className={`block text-[11px] truncate ${t.muted}`}>{c.ministries.join(', ')}</span>}
                    </span>
                    <RoleChip t={t} role={c.contact_role} />
                  </button>
                  <button onClick={() => { remember(c.id); openThread('dm', c.id); }} aria-label={`Message ${c.display_name}`} title="Message"
                    className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-blue-500 hover:bg-blue-500/10">
                    <MessageCircle size={17} />
                  </button>
                </li>
              ))}
            </ul>

            {picker === 'group' && (
              <div className={`p-4 border-t ${t.pane}`}>
                {createError && <p className="text-xs text-rose-500 mb-2">{createError}</p>}
                <button onClick={createGroup} disabled={creating || !groupName.trim() || selected.length === 0}
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl h-11 text-sm font-semibold">
                  {creating && <Loader2 size={15} className="animate-spin" />}
                  {creating ? 'Creating...' : `Create group${selected.length ? ` with ${selected.length} ${selected.length === 1 ? 'person' : 'people'}` : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Group details ──────────────────────────────────────────────── */}
      {info && active?.kind === 'group' && (
        <div className={backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) setInfo(false); }}>
          <div role="dialog" aria-modal="true" aria-label="Group details" className={modalShell}>
            <div className={`p-4 border-b ${t.pane} flex items-center justify-between`}>
              <h2 className={`font-bold ${t.text}`}>Group details</h2>
              <button onClick={() => setInfo(false)} aria-label="Close" className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.ghost}`}><X size={18} /></button>
            </div>

            <div className="overflow-y-auto flex-1">
              {iAmOwner && (
                <div className="p-4 pb-2">
                  <label htmlFor="g-rename" className={`block text-xs font-semibold mb-1.5 ${t.sub}`}>Group name</label>
                  <div className="flex gap-2">
                    <input id="g-rename" type="text" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} maxLength={60}
                      className={`flex-1 border rounded-xl px-4 py-2.5 text-sm ${t.input}`} />
                    <button onClick={saveRename} disabled={infoBusy || !renameVal.trim() || renameVal.trim() === activeItem?.name}
                      className="px-4 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-1.5">
                      <Pencil size={14} /> Save
                    </button>
                  </div>
                </div>
              )}

              <p className={`px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider ${t.muted}`}>{members.length} members</p>
              <ul>
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar t={t} name={m.display_name} size="w-9 h-9 text-xs" />
                    {m.user_id === me ? (
                      <span className={`text-sm font-semibold flex-1 truncate ${t.text}`}>{m.display_name} (you)</span>
                    ) : (
                      <button onClick={() => setProfileId(m.user_id)} title="See profile"
                        className={`text-sm font-semibold flex-1 truncate text-left hover:underline ${t.text}`}>{m.display_name}</button>
                    )}
                    {m.is_owner && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#c5a66a]/20 text-[#9c7f45]">Owner</span>}
                    <RoleChip t={t} role={m.contact_role} />
                    {iAmOwner && m.user_id !== me && (
                      <button onClick={() => removePerson(m)} disabled={infoBusy} aria-label={`Remove ${m.display_name}`} title="Remove"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.muted} hover:text-rose-500 hover:bg-rose-500/10`}>
                        <X size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {iAmOwner && (
                <div className={`mt-2 pt-3 border-t ${t.pane}`}>
                  <p className={`px-4 pb-2 text-xs font-semibold uppercase tracking-wider ${t.muted}`}>Add people</p>
                  <div className="px-4 pb-2">
                    <div className="relative">
                      <Search size={15} className={`absolute left-3 top-3 ${t.muted}`} />
                      <input type="text" value={addQuery} onChange={(e) => setAddQuery(e.target.value)}
                        placeholder="Search people" aria-label="Search people to add" className={field} />
                    </div>
                  </div>
                  <ul className="max-h-48 overflow-y-auto">
                    {addable.length === 0
                      ? <li className={`px-4 py-3 text-sm ${t.sub}`}>No one else to add.</li>
                      : addable.map((c) => (
                        <PickRow key={c.id} t={t} person={c} checked={addSel.includes(c.id)} onToggle={() => toggle(addSel, setAddSel, c.id)} />
                      ))}
                  </ul>
                  <div className="p-4 pt-2">
                    <button onClick={addPeople} disabled={infoBusy || addSel.length === 0}
                      className="w-full h-10 rounded-xl border text-sm font-semibold disabled:opacity-50 border-blue-600 text-blue-600 hover:bg-blue-600/10">
                      {addSel.length ? `Add ${addSel.length} ${addSel.length === 1 ? 'person' : 'people'}` : 'Add selected'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={`p-4 border-t ${t.pane}`}>
              {infoError && <p className="text-xs text-rose-500 mb-2">{infoError}</p>}
              <button onClick={leaveGroup} disabled={infoBusy}
                className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-500/10 disabled:opacity-50">
                <LogOut size={15} /> Leave group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── A person's profile (db/061) ───────────────────────────────── */}
      {profileId && (
        <PersonProfile key={profileId} personId={profileId} onClose={() => setProfileId(null)}
          onMessage={(id) => { setProfileId(null); setInfo(false); openThread('dm', id); }} />
      )}
    </div>
  );
}
