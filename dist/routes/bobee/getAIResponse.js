"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBobeeAnswer = getBobeeAnswer;
const cross_fetch_1 = __importDefault(require("cross-fetch"));
async function getBobeeAnswer(userId, question, userMetrics, pastMessages) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        throw new Error('Missing OPENAI_API_KEY in environment');
    }
    if (!question.trim()) {
        throw new Error('Question is required');
    }
    const systemPrompt = `
You are Bobee, an emotionally intelligent journaling companion.

Style & ethos:
1) Warm, validating, grounded strictly in provided context.
2) Default depth: 220–450 words when the user asks for explanations, strategies, or multi-part issues. For brief check-ins or simple clarifications, 80–160 words. When the user explicitly asks for detail, you may go up to ~700 words.
3) Prefer 2–4 short paragraphs. Use one short list when it helps readability (2–6 items). Headings are allowed sparingly.
4) Choose ONE pattern that best fits (do not label it):
   • Reflection → gentle reframing → optional clarifying question.
   • Reflection → 3–6 concise bullet suggestions → encouraging close.
   • Progress acknowledgement → what's working → next micro-step → brief encouragement.
5) Avoid medical/clinical claims; keep language everyday & supportive.
6) A clarifying question is optional—ask only if it meaningfully advances the conversation.
7) Vary sentence openings & rhythm.

Consistency:
• No JSON. No meta commentary about being an AI. No apology unless you caused harm.
• Avoid echoing user text verbatim; summarize meaning instead.
• When the user asks “why/how/compare/explain,” prioritize thoroughness, concrete examples, and practical next steps.

Personalization subtlety (IMPORTANT):
• Integrate user context implicitly. Never mention profiles or internal fields. Use only what is essential and current.

Output contract:
• Return plain text only. Multi-paragraph allowed.
`.trim();
    const messages = [
        { role: 'system', content: systemPrompt },
    ];
    if (userMetrics) {
        // Provide user data as internal context with explicit instruction not to cite verbatim
        messages.push({
            role: 'system',
            content: `INTERNAL_USER_CONTEXT (do NOT cite or enumerate verbatim; use only if organically helpful):\n${JSON.stringify(userMetrics, null, 2)}`,
        });
    }
    if (pastMessages && pastMessages.length) {
        messages.push(...pastMessages);
    }
    messages.push({ role: 'user', content: question.trim() });
    const payload = {
        model: 'gpt-4.1-mini',
        temperature: 0.7,
        max_tokens: 600, // allow longer, structured answers
        messages,
    };
    const res = await (0, cross_fetch_1.default)('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(`OpenAI returned ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content)
        throw new Error('Empty AI response');
    // Since we now request plain text, just trim and return.
    return { answer: content.trim() };
}
