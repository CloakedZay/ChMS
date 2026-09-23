import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/app/lib/supabase";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { question, church_id } = await req.json();

    if (!question || !church_id) {
      return NextResponse.json(
        { error: "Missing question or church_id" },
        { status: 400 }
      );
    }

    // 1. Pull active docs for this church
    const { data: docs, error } = await supabase
      .from("chatbot_documents")
      .select("title, content, doc_type")
      .eq("church_id", church_id)
      .eq("is_active", true);

    if (error) throw error;

    // 2. Build context from docs
    const context = docs && docs.length > 0
      ? docs.map((d) => `### ${d.title} (${d.doc_type})\n${d.content}`).join("\n\n")
      : "(No reference documents have been uploaded yet.)";

    const systemPrompt = `You are a friendly assistant for a church's members.

Rules:
- For greetings and small talk (e.g. "hi", "hello", "thank you", "good morning"), respond warmly and briefly, like a normal conversation partner.
- For any substantive question (church policies, schedules, beliefs, etc.), answer ONLY using the church documents provided below. Do not use outside knowledge of theology or other churches' beliefs.
- If a substantive question is outside the scope of these documents, or no documents are available to answer it, politely say you can't help with that from what's available and suggest they speak with a pastor.
- Keep answers clear and concise. Cite the relevant section/article title when helpful.

CHURCH DOCUMENTS:
${context}`;

    // 3. Call the LLM
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    });

    const answer =
      response.content.find((c) => c.type === "text")?.text ??
      "Sorry, I couldn't generate an answer.";

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("Chatbot API error:", err);
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "Chatbot service error" },
        { status: err.status ?? 500 }
      );
    }
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}