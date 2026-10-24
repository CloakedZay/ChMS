'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { headingQuestion } from '@/app/lib/nlp';

// Questions for the Assistant's welcome screen that the church's own
// documents can answer: "What is in chapter N?" for chapter / article
// headings in the branch's documents and the shared ones (knowledge_chunks,
// db/035; the database shows each person only what they may read, db/045).
// Up to `count`, a different handful each time. Empty when no document has
// numbered headings (then only the always-answerable questions show).

export function useAssistantSuggestions(churchId, count = 3) {
  const [list, setList] = useState([]);

  useEffect(() => {
    if (!churchId) return;
    let stale = false;
    supabase.from('knowledge_chunks')
      .select('content')
      .eq('source_type', 'document').eq('is_active', true)
      .or(`church_id.eq.${churchId},church_id.is.null`)
      .or('content.ilike.chapter %,content.ilike.article %')
      .order('chunk_index')
      .limit(200)
      .then(({ data }) => {
        if (stale) return;
        const seen = new Set();
        const all = [];
        for (const row of data || []) {
          const r = headingQuestion(row.content.split('\n')[0]);
          if (r && !seen.has(r.question)) { seen.add(r.question); all.push(r); }
        }
        for (let i = all.length - 1; i > 0; i--) {   // shuffle
          const j = Math.floor(Math.random() * (i + 1));
          [all[i], all[j]] = [all[j], all[i]];
        }
        setList(all.slice(0, count));
      }, () => {});
    return () => { stale = true; };
  }, [churchId, count]);

  return churchId ? list : [];
}
