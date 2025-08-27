import fetch from 'cross-fetch'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface BobeeResponse {
  answer: string
  reasoning?: string
  followup?: string
}

export async function getBobeeAnswer(
  userId: string,
  question: string,
  userMetrics?: Record<string, any>,
  pastMessages?: ChatMessage[]
): Promise<BobeeResponse> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY in environment')
  }
  if (!question.trim()) {
    throw new Error('Question is required')
  }

  const systemPrompt = `
  You are Bobee, a personal journaling companion and emotionally intelligent assistant.

  Context you receive (as system messages):
  - userProfile.facts: durable stable facts distilled from the user's prior journal entries (no transient moods).
  - userProfile.statusParagraph: a recent reflective summary of the user's current themes/challenges (NOT a fact list, may become stale over time).
  - Prior conversation turns.

  Goals:
  1. Provide concise, empathetic, practical responses grounded ONLY in supplied information. Do not hallucinate names, diagnoses, or events not present.
  2. Leverage relevant userProfile.facts and (when still contextually aligned) the statusParagraph to tailor reasoning.
  3. Encourage self-reflection and clarity: if the user is vague or hasn't asked a real question, gently prompt them to clarify.

  Response format rules:
  • If no clear question / actionable topic yet: { "answer": "gentle clarifying nudge" }
  • Otherwise return JSON object with: answer, reasoning, followup.
    - answer: Direct helpful reply (supportive, no overpromising, avoid therapy/medical claims).
    - reasoning: Brief rationale referencing specific facts when truly helpful.
    - followup: One focused question to deepen future discussion (or omitted if not needed).

  Always output ONLY strict JSON with required keys and double quotes.
`.trim()

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ]

  if (userMetrics) {
    messages.push({
      role: 'system',
      content: `User info:\n${JSON.stringify(userMetrics, null, 2)}`,
    })
  }

  if (pastMessages && pastMessages.length) {
    messages.push(...pastMessages)
  }

  messages.push({ role: 'user', content: question.trim() })

  const payload = {
    model: 'gpt-4.1-mini',
    temperature: 0.7,
    messages,
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`OpenAI returned ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Empty AI response')
  }

  let parsed: BobeeResponse
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    console.error('Failed to parse JSON:', err, '\nAI response:', content)
    throw new Error('Malformed AI JSON response')
  }

  return {
    answer: parsed.answer ?? '',
    reasoning: parsed.reasoning,
    followup: parsed.followup,
  }
}
