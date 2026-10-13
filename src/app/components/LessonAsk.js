'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Send, Loader2, ChevronDown, ChevronUp, Bot } from 'lucide-react';
import { authFetch } from '@/app/lib/authFetch';
import { useAssistantQuota, quotaText } from '@/app/lib/useAssistantQuota';

// "Ask about this lesson" — a small question box inside one discipleship
// module. Answers come only from that module's handouts and description
// (the assistant with module_id, db/037). Written with the member pages'
// dark classes; the .member-light rules give the light version.

export default function LessonAsk({ moduleId, title }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [items, setItems] = useState([]);     // { q, a, error }
  const [busy, setBusy] = useState(false);
  const quota = useAssistantQuota();   // Members: questions left today
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [items, busy]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  async function ask(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    try {
      const res = await authFetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, module_id: moduleId, previous: items[items.length - 1]?.q || '' }),
      });
      const data = await res.json();
      quota.update(data);
      setItems((list) => [...list, { q, a: data.answer || data.error || 'Sorry, something went wrong.', error: !res.ok }]);
    } catch {
      setItems((list) => [...list, { q, a: "Sorry, I couldn't reach the assistant. Please try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-2 border-t border-white/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 py-1 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          <MessageCircleQuestion className="w-4 h-4 text-blue-400" />
          Ask about this lesson
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-white/40">
            Questions are answered from the handouts of “{title}”. In English or Tagalog.
          </p>

          {items.length > 0 && (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {items.map((it, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm bg-blue-600 text-white">{it.q}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-7 h-7 rounded-lg bg-slate-500/10 border border-slate-500/20 flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                    <p className={`max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap bg-slate-900/60 ${it.error ? 'text-rose-400' : 'text-slate-200'}`}>
                      {it.a}
                    </p>
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking in the handouts…
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}

          <form onSubmit={ask} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Ano ang ibig sabihin ng…?"
              aria-label={`Ask about ${title}`}
              maxLength={500}
              disabled={busy || quota.used}
              className="flex-1 min-w-0 bg-[#111815] border border-white/10 rounded-full py-2 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Ask"
              className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center justify-center shrink-0"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
          {quotaText(quota) && (
            <p className={`text-[11px] ${quota.used ? 'text-orange-400' : 'text-white/40'}`}>{quotaText(quota)}</p>
          )}
        </div>
      )}
    </div>
  );
}
