import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

type CoachId = "presence" | "pride" | "power";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// NOTE: Replace these placeholders with your real system prompts.
const SYSTEM_PROMPTS: Record<CoachId, string> = {
  presence: "You are the Presence Coach. Follow the Presence protocol exactly.",
  pride: "You are the Pride Coach. Follow the Pride protocol exactly.",
  power: "You are the Power Coach. Follow the Power protocol exactly.",
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
