'use client';

import { MessageSquarePlus, MessageSquare, Trash2 } from 'lucide-react';
import { useTheme } from '@/app/context/ThemeContext';
import { confirmDialog } from '@/app/lib/dialog';

// The chat list beside the assistant: "New chat" and the person's saved
// chats (useAssistantChats). A side column on wider screens; a compact bar
// with a dropdown on phones. Fixed hex colours so it reads the same on the
// staff and member pages.

const when = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

export default function ChatHistory({ hist, onNew, onOpen, disabled = false }) {
  const { dark } = useTheme();
  if (!hist.ready) return null;   // db/040 not run yet: no history, plain chat

  const t = dark
    ? { pane: 'border-white/10', text: 'text-[#e9ece9]', muted: 'text-[#858b87]', row: 'hover:bg-white/5', on: 'bg-white/10',
        btn: 'border-white/10 text-[#e9ece9] hover:bg-white/5', select: 'bg-[#111815] border-white/10 text-[#e9ece9]' }
    : { pane: 'border-[#efede4]', text: 'text-[#173f35]', muted: 'text-[#858b87]', row: 'hover:bg-[#f8f7f2]', on: 'bg-[#e8f0ea]',
        btn: 'border-[#d9d6c8] text-[#173f35] hover:bg-[#f8f7f2]', select: 'bg-white border-[#d9d6c8] text-[#252a28]' };

  const chats = hist.chats || [];
  const newBtn = (
    <button type="button" onClick={onNew} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 h-9 px-3 rounded-xl border text-sm font-semibold disabled:opacity-50 ${t.btn}`}>
      <MessageSquarePlus size={16} strokeWidth={1.75} /> New chat
    </button>
  );

  return (
    <>
      {/* Phones: New chat + a dropdown of saved chats */}
      <div className={`md:hidden flex items-center gap-2 p-3 border-b ${t.pane}`}>
        {newBtn}
        <select value={hist.activeId || ''} disabled={disabled}
          onChange={(e) => (e.target.value ? onOpen(e.target.value) : onNew())}
          aria-label="Saved chats"
          className={`flex-1 min-w-0 h-9 rounded-xl border px-3 text-sm ${t.select}`}>
          <option value="">{hist.activeId ? 'New chat' : chats.length ? 'Saved chats…' : 'No saved chats yet'}</option>
          {chats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {/* Wider screens: a side column */}
      <aside className={`hidden md:flex w-64 shrink-0 flex-col border-r ${t.pane}`} aria-label="Saved chats">
        <div className={`p-3 border-b ${t.pane}`}>{newBtn}</div>
        <div className="flex-1 overflow-y-auto p-2">
          {hist.chats === null ? (
            <div className="space-y-2 p-1">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 w-full" />)}</div>
          ) : chats.length === 0 ? (
            <p className={`text-xs px-2 py-3 ${t.muted}`}>Your chats will be saved here so you can come back to them.</p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((c) => (
                <li key={c.id} className="group relative">
                  <button type="button" onClick={() => onOpen(c.id)} disabled={disabled}
                    className={`w-full text-left flex items-start gap-2 rounded-xl px-2.5 py-2 pr-8 ${hist.activeId === c.id ? t.on : t.row}`}>
                    <MessageSquare size={14} strokeWidth={1.75} className={`shrink-0 mt-0.5 ${t.muted}`} />
                    <span className="min-w-0">
                      <span className={`block text-xs font-semibold truncate ${t.text}`}>{c.title}</span>
                      <span className={`block text-[10px] ${t.muted}`}>{when(c.updated_at)}</span>
                    </span>
                  </button>
                  <button type="button" disabled={disabled}
                    onClick={async () => { if (await confirmDialog(`Delete the chat “${c.title}”?`)) hist.remove(c.id).then(() => { if (hist.activeId === c.id) onNew(); }); }}
                    aria-label={`Delete ${c.title}`} title="Delete chat"
                    className={`absolute right-1.5 top-2 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 ${t.muted} hover:text-rose-500`}>
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
