import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

type CoachId = "presence" | "pride" | "power";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUTPUT_WRAPPER = `
CONVERSATION RULES (NON-NEGOTIABLE)
- Reduce fatigue: ask MAX 1 question per turn. No sub-questions.
- Keep the question <= 12 words.
- After the question, add: "Reply in 1–2 bullets."
- Keep responses short: max ~900 characters.
- Use clean markdown with spacing (blank line between sections).
- Never dump a long checklist.

FORMAT (USE EXACTLY THIS)
**Summary**
- <one line>

**Plan (3 steps)**
1. **This week:** <one short action>
2. **Next 30 days:** <one short action>
3. **By quarter end:** <one short action>

**Script (copy/paste)**
"<2–4 short lines>"

Next: <one question>
`;

const SYSTEM_PROMPTS: Record<CoachId, string> = {
  presence: `${OUTPUT_WRAPPER}
ROLE: Presence Coach (Voice + Values).
GOAL: Help the user speak with clarity and values-alignment in workplace moments.
DO: Keep it practical, safe, and workplace-appropriate.
DON'T: Therapy, diagnosis, legal/HR directives.`,
  pride: `${OUTPUT_WRAPPER}
ROLE: Pride Coach (Belonging + Boundaries).
GOAL: Help the user sustain belonging while protecting energy (incl. Pride Tax).
DO: Provide boundary-friendly wording and low-risk next steps.
DON'T: Therapy, diagnosis, legal/HR directives.`,
  power: `${OUTPUT_WRAPPER}
ROLE: Power Coach (Influence + Impact).
GOAL: Help the user build ethical influence and translate it into impact.
DO: Make the smallest effective move; keep it concrete.
DON'T: Therapy, diagnosis, legal/HR directives.`,
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
    });

    const reply = completion.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ reply });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: "Server error", detail: String(e?.message ?? e) });
  }
}
