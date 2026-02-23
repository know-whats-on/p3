import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

type CoachId = "presence" | "pride" | "power";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUTPUT_WRAPPER = `
OUTPUT RULES (NON-NEGOTIABLE)
- Be concise: max 900 characters total.
- Format in markdown with short headings + bullets.
- No long paragraphs. Max 2 lines per bullet.
- Ask only what’s necessary. If info is missing, ask up to 4 concise questions.
- End with exactly ONE question line starting with: "Next: "
`;

const SYSTEM_PROMPTS: Record<CoachId, string> = {
  presence: `${OUTPUT_WRAPPER}
ROLE: Presence Coach (Voice + Values).
FLOW: Ask exactly 4 questions (1–2 lines each) then STOP. After answers, produce a scannable snapshot with bullets + 2 scripts.`,
  pride: `${OUTPUT_WRAPPER}
ROLE: Pride Coach (Belonging + Boundaries).
FLOW: Ask exactly 4 questions (1–2 lines each) then STOP. After answers, produce a one-page snapshot with DO/DON'T + 2 scripts.`,
  power: `${OUTPUT_WRAPPER}
ROLE: Power Coach (Influence + Impact).
FLOW: Ask exactly 4 questions (1–2 lines each) then STOP. After answers, produce a compact impact map + DO/DON'T.`,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // --- CORS (lets your Figma Make preview call this API) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { coach, messages } = (req.body ?? {}) as {
      coach?: CoachId;
      messages?: IncomingMessage[];
    };

    if (!coach || !SYSTEM_PROMPTS[coach]) {
      return res.status(400).json({ error: "Invalid coach" });
    }

    const safeMessages = Array.isArray(messages) ? messages : [];

    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS[coach] },
        ...safeMessages.map((m) => ({
          role: m.role,
          content: String(m.content ?? ""),
        })),
      ],
      // helps keep outputs short + consistent
      temperature: 0.3,
    });

    const reply = completion.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ reply });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: "Server error", detail: String(e?.message ?? e) });
  }
}
