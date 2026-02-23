import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type CoachId = "presence" | "pride" | "power";

const SYSTEM_PROMPTS: Record<CoachId, string> = {
  presence: `<<PASTE YOUR PRESENCE SYSTEM PROMPT HERE>>`,
  pride: `<<PASTE YOUR PRIDE SYSTEM PROMPT HERE>>`,
  power: `<<PASTE YOUR POWER SYSTEM PROMPT HERE>>`,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (process.env.APP_TOKEN && token !== process.env.APP_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { coach_id, messages } = req.body || {};
    if (!coach_id || !SYSTEM_PROMPTS[coach_id as CoachId]) {
      return res.status(400).json({ error: "Invalid coach_id" });
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

    return res.status(200).json({ reply: response.output_text });
  } catch (e: any) {
    return res.status(500).json({ error: "Server error", detail: String(e?.message || e) });
  }
}
