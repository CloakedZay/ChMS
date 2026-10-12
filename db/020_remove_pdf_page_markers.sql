-- =====================================================================
-- 020 — Remove "-- 1 of 3 --" page markers from saved text
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction.
--
-- The PDF reader put a page marker like "-- 1 of 3 --" between pages, and
-- uploads saved it into Bible verses and chatbot documents. New uploads
-- now strip it (lib/pdfText.ts); this cleans what's already saved. Only
-- the marker text is removed — nothing else changes.
--
-- BEFORE running, see how many are affected (read only):
--
-- select 'bible_verses' as tbl, count(*) as with_markers
-- from public.bible_verses where verse_text ~ '--\s*\d+\s+of\s+\d+\s*--'
-- union all
-- select 'chatbot_documents', count(*)
-- from public.chatbot_documents where content ~ '--\s*\d+\s+of\s+\d+\s*--';
-- =====================================================================

begin;

-- Verses are one line: drop the marker, then tidy the spaces it leaves.
update public.bible_verses
set verse_text = trim(regexp_replace(
      regexp_replace(verse_text, '\s*--\s*\d+\s+of\s+\d+\s*--\s*', ' ', 'g'),
      '\s{2,}', ' ', 'g'))
where verse_text ~ '--\s*\d+\s+of\s+\d+\s*--';

-- Documents keep their line breaks: the marker becomes a line break.
update public.chatbot_documents
set content = regexp_replace(content, '[ \t]*--[ \t]*\d+[ \t]+of[ \t]+\d+[ \t]*--[ \t]*', E'\n', 'g')
where content ~ '--\s*\d+\s+of\s+\d+\s*--';

commit;

-- =====================================================================
-- Verify (run after commit). Expect both counts = 0.
--
-- select 'bible_verses' as tbl, count(*) as with_markers
-- from public.bible_verses where verse_text ~ '--\s*\d+\s+of\s+\d+\s*--'
-- union all
-- select 'chatbot_documents', count(*)
-- from public.chatbot_documents where content ~ '--\s*\d+\s+of\s+\d+\s*--';
-- =====================================================================
