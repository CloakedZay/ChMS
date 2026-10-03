'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { supabase } from '@/app/lib/supabase';
import { Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';

export default function MemberChatbotPage() {
  const { user } = useAuth();

  const [churchId, setChurchId] = useState(null);
  const [loadingChurch, setLoadingChurch] = useState(true);

  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    async function fetchProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('church_id')
        .eq('id', user.id)
        .single();
      setChurchId(data?.church_id || null);
      setLoadingChurch(false);
    }
    fetchProfile();
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function handleSend(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending || !churchId) return;

    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, church_id: churchId }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.answer || data.error || 'Sorry, something went wrong.', isError: !res.ok },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: "Sorry, I couldn't reach the assistant. Please try again.", isError: true },
      ]);
    } finally {
      setSending(false);
    }
  }

  const disabled = sending || loadingChurch || !churchId;

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen flex flex-col">
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">GGCF-GMI · Pandi, Bulacan</p>
        <h1 className="text-2xl font-black text-white">Church Assistant</h1>
        <p className="text-slate-500 text-sm mt-0.5">Ask questions answered from your church&apos;s reference documents</p>
      </div>

      <div className="flex-1 flex flex-col bg-[#1a1d2e] border border-white/10 rounded-3xl overflow-hidden min-h-0">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-[50vh]">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <Sparkles className="w-8 h-8 text-slate-700 mb-3" />
              <p className="text-sm font-bold text-white">Ask me anything about the church</p>
              <p className="text-xs text-white/40 mt-1 max-w-xs">
                {loadingChurch
                  ? 'Loading your profile...'
                  : !churchId
                  ? 'No church is linked to your account yet — contact your admin.'
                  : 'Answers are based only on documents your church admin has uploaded.'}
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                  m.role === 'user' ? 'bg-blue-600/20 border-blue-500/20' : 'bg-slate-500/10 border-slate-500/20'
                }`}>
                  {m.role === 'user' ? <User className="w-4 h-4 text-blue-400" /> : <Bot className="w-4 h-4 text-slate-400" />}
                </div>
                <div className={`max-w-[80%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-blue-600 text-white' : m.isError ? 'bg-slate-900/60 text-rose-400' : 'bg-slate-900/60 text-slate-200'
                }`}>
                  {m.text}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border bg-slate-500/10 border-slate-500/20">
                <Bot className="w-4 h-4 text-slate-400" />
              </div>
              <div className="rounded-2xl px-4 py-2.5 text-sm bg-slate-900/60 text-slate-200 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="flex items-center gap-2 p-3 sm:p-4 border-t border-white/10">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={!churchId && !loadingChurch ? 'No church linked to this account...' : 'Ask a question...'}
            disabled={disabled}
            className="flex-1 min-w-0 bg-[#0f111a] border border-white/10 rounded-full py-2.5 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={disabled || !input.trim()}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center justify-center transition-all active:scale-95 shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
