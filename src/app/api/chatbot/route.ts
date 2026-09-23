import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "what", "how", "when",
  "where", "why", "who", "which", "do", "does", "did", "can", "could",
  "i", "you", "we", "our", "your", "my", "for", "of", "to", "in", "on",
  "and", "or", "about", "please", "tell", "me", "us", "there", "any",
  "own", "words", "word", "explain", "summarize", "summarise", "describe",
  "discuss", "mean", "meaning", "means", "understand",
]);

function keywords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return words.filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function greetingReply(question: string): string | null {
  const q = question.trim().toLowerCase().replace(/[.,!?]+$/g, "");
  if (/^(hi|hello|hey|yo|good day)$/.test(q)) {
    return "Hello! Ask me anything about the church's reference documents and I'll try to find an answer.";
  }
  if (/^good (morning|afternoon|evening)$/.test(q)) {
    return "Good day! What would you like to know from the church's documents?";
  }
  if (/^how are you$/.test(q)) {
    return "I'm doing well, thanks for asking! How can I help you today?";
  }
  if (/^thanks?( you)?( so much| a lot)?$/.test(q)) {
    return "You're welcome!";
  }
  return null;
}

function scoreText(text: string, words: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of words) {
    score += lower.split(w).length - 1;
  }
  return score;
}

function chunkContent(content: string): string[] {
  const chunks = content
    .split(/\n\s*\n+|--\s*\d+\s*of\s*\d+\s*--/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !/table of contents/i.test(c));
  return chunks.length > 0 ? chunks : [content];
}

function toRoman(num: number): string {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [value, symbol] of table) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
}

function findRequestedChapter(question: string): number | null {
  const m = question.match(/\b(?:chapter|article|section)\s+(\d{1,3})\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function findHeadingChunk(chunks: string[], roman: string): string | null {
  const re = new RegExp(`^${roman}\\.\\s`, "m");
  return chunks.find((c) => re.test(c)) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const { question, church_id } = await req.json();

    if (!question || !church_id) {
      return NextResponse.json(
        { error: "Missing question or church_id" },
        { status: 400 }
      );
    }

    const greeting = greetingReply(question);
    if (greeting) {
      return NextResponse.json({ answer: greeting });
    }

    const { data: docs, error } = await supabase
      .from("chatbot_documents")
      .select("title, content, doc_type")
      .eq("church_id", church_id)
      .eq("is_active", true);

    if (error) throw error;

    if (!docs || docs.length === 0) {
      return NextResponse.json({
        answer: "No reference documents have been uploaded yet. Ask an admin to add some in the Documents tab.",
      });
    }

    type Match = { title: string; doc_type: string; text: string };
    let matches: Match[] = [];

    const chapterNum = findRequestedChapter(question);
    if (chapterNum !== null) {
      const roman = toRoman(chapterNum);
      matches = docs
        .map((d): Match | null => {
          const chunk = findHeadingChunk(chunkContent(d.content), roman);
          return chunk ? { title: d.title, doc_type: d.doc_type, text: chunk } : null;
        })
        .filter((m): m is Match => m !== null);
    }

    if (matches.length === 0) {
      const words = keywords(question);
      if (words.length === 0) {
        return NextResponse.json({
          answer: "Try asking about something specific from the church's reference documents.",
        });
      }

      matches = docs
        .flatMap((d) =>
          chunkContent(d.content).map((chunk) => ({
            title: d.title,
            doc_type: d.doc_type,
            text: chunk,
            score: scoreText(chunk, words) + (scoreText(d.title, words) > 0 ? 5 : 0),
          }))
        )
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ title, doc_type, text }): Match => ({ title, doc_type, text }));
    }

    if (matches.length === 0) {
      return NextResponse.json({
        answer: "I couldn't find anything about that in the uploaded documents. Try rephrasing, or ask a pastor directly.",
      });
    }

    const answer = matches
      .map((m) => `**${m.title}** (${m.doc_type})\n${m.text}`)
      .join("\n\n");

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("Chatbot API error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
