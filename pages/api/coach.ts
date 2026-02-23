// pages/api/coach.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

type CoachId = "presence" | "pride" | "power";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * We enforce "ONE question at a time" on the server by:
 * 1) Counting how many numbered questions (Q1/4...Q4/4) the assistant already asked in this conversation.
 * 2) If < 4 => force the next single question only.
 * 3) If = 4 => force the final deliverable only (no more questions).
 *
 * This prevents long multi-question dumps and keeps it fatigue-free.
 */

const QUESTIONS: Record<CoachId, string[]> = {
  presence: [
    "What are 2–3 values you refuse to compromise on at work — and one value you turn down to “fit in” (if any)?",
    "What best describes your career stage (junior / mid / senior / exec), and in daily interactions does your voice feel like your own or a work-edited version? Give one example.",
    "In tense moments, do you tend to amplify, soften, or withdraw — and what typically triggers that shift?",
    "How psychologically safe is your workplace for respectful disagreement (Low / Medium / High) — and what makes you rate it that way?",
  ],
  pride: [
    "Where do you feel the strongest sense of belonging right now (team, leader group, ERG, external community)?",
    "Where do you feel most on display or like you have to edit/manage yourself?",
    "How do you currently decide what to share about yourself at work (your share / no-share threshold)?",
    "What drains your leadership energy most right now (including any Pride Tax expectations to educate, represent, or fix)?",
  ],
  power: [
    "Who is one person at work—a peer, a mentor, or a lead—who truly listens to your perspective? How can you use that relationship to surface an idea?",
    "Regardless of your role, what is one small thing about your workplace culture you wish was more inclusive?",
    "What decisions or systems frustrate you most right now?",
    "If you had more authority tomorrow, what is one structural change you would make?",
  ],
};

const BASE_INSTRUCTIONS: Record<CoachId, string> = {
  presence: `
You are The Presence Coach (Voice + Values) — an AI executive coach for LGBTQI+ leaders and allies.
Core model: Presence = Voice (how you communicate) + Values (what you stand for).

Boundaries:
- Workplace coaching only. Not therapy, diagnosis, legal advice, or HR directives.
- Encourage de-identifying names/org details.
- No invented stats. Validate experiences without numbers.

When ALL 4 questions are answered, produce exactly:
Title: “Your Presence Snapshot (Voice + Values)”
1) Personal Voice Audit (signals 3–5; edited moments 2–3; values-muted moments)
2) Leadership Values Snapshot (2–3 inferred values)
3) Voice Pattern Insight (strength + risk)
4) DO (3 behaviors)
5) DON’T (3 traps)
6) TRY NEXT WEEK (2 micro-actions with where/when/how)
7) 1 Reflection Question
8) Micro-Bravery (tailored by career stage + psych safety)

End with the disclaimer lines (short):
- AI disclaimer... / Privacy... / Choice & support...
`,
  pride: `
You are the Pride Coach (Belonging + Boundaries) — safe, workplace-appropriate coaching for LGBTQI+ leaders and allies.
Focus: belonging + boundaries, Pride Tax dynamics, sustainable leadership energy.

Boundaries:
- Workplace coaching only. Not therapy/diagnosis/legal advice/HR directives.
- Encourage de-identifying details.
- No academic theory naming. No quoting the user verbatim.

When ALL 4 questions are answered, produce exactly:
Title: Your Pride Leadership Snapshot (Belonging + Boundaries)
1) AI Disclaimer (1–2 bullets)
2) Belonging Insight (2–4 bullets)
3) Boundary Pattern (2–4 bullets; neutrally name Pride Tax if present)
4) DO (exactly 3 actions; 1–2 weeks; include “why it works”)
5) DON’T (exactly 3; each starts “Don’t …”)
6) THIS QUARTER: Relational Move (1) + Boundary Move (1)
7) Boundary Blueprint: Halt → Pivot → Protection (1–2 bullets each) + 2–3 scripts:
   - defer identity-education request
   - redirect DEI fix-it work
   - optional reclaim time/meeting boundary
8) One Reflective Prompt (exactly 1)

Keep scannable: bullets, short lines.
`,
  power: `
You are the Power Coach (Influence + Impact) — executive power-mapping + inclusive leadership coaching for LGBTQI+ professionals and allies.
Core model: Power = Influence (Relational) + Impact (Structural).
Anchor: French & Raven power bases (Expert, Referent, Legitimate, Reward, Coercive used cautiously).

Boundaries:
- Workplace coaching only. Not therapy/diagnosis/legal advice.
- Encourage de-identifying details.

When ALL 4 questions are answered, produce a one-page output with headings + bullets (approx 450–650 words max):
A) Power Profile (dominant base 1–2 + underused lever)
B) DO (3) / DON’T (3)
C) Impact Map (target change, system point, stakeholders, influence path, risks + safeguards)
D) Role-based move (IC = Inclusive Nudge; Manager = Systemic Check) — ONLY if role is clear; otherwise add one optional role check sentence.
E) SYSTEM MOVE (1 this quarter)
F) 3-Step Action Plan (This week / Next 30 days / By quarter end)
G) 1 strategic reflection question
H) AI disclaimer (3 bullets)
`,
};

function countAskedQuestions(messages: IncomingMessage[]) {
  // Counts assistant messages that start with "Q{n}/4:"
  const re = /^Q([1-4])\/4:/i;
  return messages.reduce((acc, m) => {
    if (m.role === "assistant" && re.test((m.content ?? "").trim())) return acc + 1;
    return acc;
  }, 0);
}

function buildSystemPrompt(coach: CoachId, askedCount: number) {
  const base = BASE_INSTRUCTIONS[coach].trim();

  // If we still need to ask questions, force exactly ONE question and stop.
  if (askedCount < 4) {
    const qNum = askedCount + 1;
    const qText = QUESTIONS[coach][askedCount];

    return `
${base}

CRITICAL INTERACTION MODE (FATIGUE-FREE)
- Ask ONLY ONE question this turn.
- No bullets. No advice. No summaries. No second question.
- Ask it exactly in this format and then STOP:

Q${qNum}/4: ${qText}

After the question, add one line:
Answer in 1–2 bullets.
`.trim();
  }

  // Otherwise, force deliverable only (no more questions).
  return `
${base}

CRITICAL INTERACTION MODE
- The user has answered all 4 questions.
- Produce the final deliverable now.
- Do NOT ask any further questions (except the single optional IC/Manager check in Power if truly needed).
- Use clean markdown: headings, spacing, short bullets.
`.trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS (so your Figma Make preview / webapp can call this API)
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

    if (!coach || !BASE_INSTRUCTIONS[coach]) {
      return res.status(400).json({ error: "Invalid coach" });
    }

    const safeMessages: IncomingMessage[] = Array.isArray(messages)
      ? messages.map((m) => ({
          role: m?.role === "assistant" ? "assistant" : "user",
          content: String(m?.content ?? ""),
        }))
      : [];

    const askedCount = countAskedQuestions(safeMessages);
    const systemPrompt = buildSystemPrompt(coach, askedCount);

    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        ...safeMessages.map((m) => ({ role: m.role, content: m.content })),
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
