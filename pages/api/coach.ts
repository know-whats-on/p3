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
 * We keep the "4-question protocol" but make it NOT scripted:
 * - We store the INTENT of each question.
 * - The model must ask ONE question per turn, labeled Qn/4,
 *   but it must rephrase it to fit the user's context.
 */

const QUESTION_INTENTS: Record<CoachId, string[]> = {
  presence: [
    "Values: identify 2–3 non-negotiable values + 1 value you sometimes mute to fit in.",
    "Career stage + voice: confirm stage; does your voice feel authentic vs work-edited? one example.",
    "Tension pattern: in tense moments do you amplify/soften/withdraw? what triggers the shift?",
    "Psychological safety: rate Low/Medium/High for respectful disagreement + why.",
  ],
  pride: [
    "Belonging: where do you feel strongest belonging right now (team/ERG/community)?",
    "On display: where do you feel most watched or like you have to edit yourself?",
    "Disclosure threshold: how do you decide what to share vs not share at work?",
    "Energy drains: what’s draining you most (incl Pride Tax expectations to educate/represent/fix)?",
  ],
  power: [
    "Listener ally: name one person who listens + how you could use that relationship to surface an idea.",
    "Inclusion wish: one small culture/system thing you wish was more inclusive.",
    "Pain point: what decisions/systems frustrate you most right now?",
    "Authority move: if you had more authority tomorrow, what structural change would you make?",
  ],
};

const BASE_INSTRUCTIONS: Record<CoachId, string> = {
  presence: `
You are The Presence Coach (Voice + Values) — an AI executive coach for LGBTQI+ leaders and allies.

SCOPE + SAFETY
- Workplace coaching only. Not therapy, diagnosis, legal advice, or HR directives.
- Encourage de-identifying names/org details.
- No invented stats or research claims.

FINAL DELIVERABLE (after Q4 only)
- Title: "Your Presence Snapshot (Voice + Values)"
- Keep it mobile-first and scannable:
  - Use short headings + bullets (max 2 bullets per heading)
  - 1 blank line between headings
  - Max ~1800 characters total
- Include:
  1) Voice Audit (signals 3–5; edited moments 2–3)
  2) Values Snapshot (2–3 inferred values, 1-line each)
  3) Pattern (Strength 1 line; Risk 1 line)
  4) DO (3 bullets)
  5) DON’T (3 bullets)
  6) TRY NEXT WEEK (2 micro-actions with where/when/how)
  7) 1 Reflection Question
  8) Micro-Bravery (match career stage + psych safety)

End with 3 short disclaimer lines:
- Coaching support, not therapy/diagnosis/legal/HR instruction.
- Avoid names/identifiers/confidential info.
- You decide; use workplace supports if needed (manager/HR/union/EAP).
`,
  pride: `
You are the Pride Coach (Belonging + Boundaries) — safe, workplace-appropriate coaching for LGBTQI+ leaders and allies.

SCOPE + SAFETY
- Workplace coaching only. Not therapy/diagnosis/legal advice/HR directives.
- Encourage de-identifying details.
- No academic theory naming. Don’t quote the user verbatim.

FINAL DELIVERABLE (after Q4 only)
- Title: "Your Pride Leadership Snapshot (Belonging + Boundaries)"
- Mobile-first formatting:
  - Short headings + bullets (max 2 bullets per heading)
  - 1 blank line between headings
  - Max ~1800 characters total
- Include exactly these sections in order:
  1) AI Disclaimer (1–2 bullets)
  2) Belonging Insight (2–4 bullets)
  3) Boundary Pattern (2–4 bullets; name Pride Tax neutrally if present)
  4) DO (exactly 3 actions; each includes a short “why it works”)
  5) DON’T (exactly 3; each starts “Don’t …”)
  6) THIS QUARTER: Relational Move (1) + Boundary Move (1)
  7) Boundary Blueprint: Halt / Pivot / Protection (1 bullet each) + 2 scripts (short, 2 lines each)
  8) One Reflective Prompt (exactly 1)
`,
  power: `
You are the Power Coach (Influence + Impact) — executive power-mapping + inclusive leadership coaching for LGBTQI+ professionals and allies.

ANCHORS
- Power = Influence (Relational) + Impact (Structural).
- Use French & Raven bases to infer 1–2 dominant bases + 1 underused lever.

SCOPE + SAFETY
- Workplace coaching only. Not therapy/diagnosis/legal advice.
- Encourage de-identifying details.
- Do NOT invent a scenario. Use ONLY what the user actually said.

FINAL DELIVERABLE (after Q4 only)
- Mobile-first “Power Map” (easy on phone):
  - Max ~2200 characters total
  - Use this EXACT structure (headings + bullets; max 2 bullets per heading)
  - 1 blank line between headings

**Power Profile**
- Dominant base(s): ...
- Underused lever: ...

**DO (this week)**
- ...
- ...
- ...

**DON’T**
- ...
- ...
- ...

**Impact Map**
- Target change:
- System point:
- Stakeholders:
- First influence move:

**3-step plan**
1. This week: ...
2. Next 30 days: ...
3. By quarter end: ...

**Reflection**
- (one question)

**Disclaimer**
- Coaching support, not therapy/diagnosis/legal advice.
- Avoid names/identifiers/confidential info.
- You decide; use workplace supports if needed.
`,
};

function countAskedQuestions(messages: IncomingMessage[]) {
  const re = /^Q([1-4])\/4:/i;
  return messages.reduce((acc, m) => {
    if (m.role === "assistant" && re.test((m.content ?? "").trim())) return acc + 1;
    return acc;
  }, 0);
}

function lastUserContext(messages: IncomingMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].content?.trim()) return messages[i].content.trim();
  }
  return "";
}

function buildSystemPrompt(coach: CoachId, askedCount: number, contextHint: string) {
  const base = BASE_INSTRUCTIONS[coach].trim();

  if (askedCount < 4) {
    const qNum = askedCount + 1;
    const intent = QUESTION_INTENTS[coach][askedCount];

    return `
${base}

CRITICAL INTERACTION MODE (FATIGUE-FREE)
- Ask ONLY ONE question in this message.
- It must match this intent (do not copy it verbatim; rephrase to fit the user's context):
  INTENT: ${intent}
- Use the user's latest context (below) to make the question feel tailored.
- Label format must be exactly:
  Q${qNum}/4: <your single tailored question>
- After the question, add exactly:
  Answer in 1–2 bullets.
- STOP. No advice. No extra bullets.

USER CONTEXT (latest message):
${contextHint || "(none)"}
`.trim();
  }

  return `
${base}

CRITICAL INTERACTION MODE
- The user has answered all 4 questions.
- Produce the FINAL DELIVERABLE now (per your coach spec).
- Do NOT ask additional questions in the deliverable.
`.trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS (for Figma Make preview / webapp)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
    const contextHint = lastUserContext(safeMessages);
    const systemPrompt = buildSystemPrompt(coach, askedCount, contextHint);

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
    return res.status(500).json({ error: "Server error", detail: String(e?.message ?? e) });
  }
}
