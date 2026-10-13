'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/app/lib/supabase';

// Saved assistant chats (db/040): the list, the open chat, and saving each
// question + answer. Private — the database only shows a person their own.
// If db/040 hasn't been run, `ready` is false and chats simply aren't saved.

const MAX_LISTED = 40;

export function useAssistantChats() {
  const [chats, setChats] = useState(null);       // null = loading
  const [ready, setReady] = useState(true);
  const [activeId, setActiveId] = useState(null); // null = a new, unsaved chat
  const activeRef = useRef(null);

  const select = (id) => { activeRef.current = id; setActiveId(id); };

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('assistant_chats')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(MAX_LISTED);
    if (error) { setReady(false); setChats([]); return; }
    setReady(true);
    setChats(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Open a saved chat; returns its messages in the chat pages' shape.
  async function open(id) {
    select(id);
    const { data } = await supabase
      .from('assistant_messages')
      .select('role, content, is_error')
      .eq('chat_id', id)
      .order('id', { ascending: true });
    return (data || []).map((m) => ({ role: m.role, text: m.content, isError: m.is_error }));
  }

  function newChat() { select(null); }

  // Save one question and its answer; the first one creates the chat,
  // titled with the question.
  async function save(question, answer, isError = false) {
    if (!ready) return;
    let id = activeRef.current;
    if (!id) {
      const { data, error } = await supabase
        .from('assistant_chats')
        .insert([{ title: question.slice(0, 80) || 'New chat' }])
        .select('id')
        .single();
      if (error) return;
      id = data.id;
      select(id);
    }
    await supabase.from('assistant_messages').insert([
      { chat_id: id, role: 'user', content: question.slice(0, 8000) },
      { chat_id: id, role: 'assistant', content: (answer || '…').slice(0, 8000), is_error: !!isError },
    ]);
    load();
  }

  async function remove(id) {
    await supabase.from('assistant_chats').delete().eq('id', id);
    if (activeRef.current === id) select(null);
    load();
  }

  return { chats, ready, activeId, open, newChat, save, remove };
}
