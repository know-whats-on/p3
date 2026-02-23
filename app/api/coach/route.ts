import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type CoachId = "presence" | "pride" | "power";

const SYSTEM_PROMPTS: Record<CoachId, string> = {
  presence: `<<PASTE YOUR PRESENCE SYSTEM PROMPT HERE>>`,
  pride: `<<PASTE YOUR PRIDE SYSTEM PROMPT HERE>>`,
  power: `<<PASTE YOUR POWER SYSTEM PROMPT HERE>>`,
};

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (process.env.APP_TOKEN && token !== process.env.APP_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { coach_id, messages } = await req.json();

    if (!coach_id || !SYSTEM_PROMPTS[coach_id as CoachId]) {
      return new Response(JSON.stringify({ error: "Invalid coach_id" }), { status: 400 });
    }

    const safeMessages = Array.isArray(messages) ? messages : [];

    const response = await client.responses.create({
      model: "gpt-5",
      instructions: SYSTEM_PROMPTS[coach_id as CoachId],
      input: safeMessages.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
      })),
    });

    return new Response(JSON.stringify({ reply: response.output_text }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: "Server error", detail: String(e?.message || e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
