// backend/src/services/getBobeeAnswer.ts
import fetch from 'cross-fetch'

/**
 * A single chat turn, either from system, user, or assistant.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * The shape of what Bobee returns.
 */
export interface BobeeResponse {
  answer: string
  reasoning?: string
  followup?: string
}

/**
 * Call OpenAI to get Bobee's answer to a question, given optional user facts
 * and past conversation turns.
 */
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
You are Bobee, a personal advisor and emotionally intelligent assistant.

Your goal is to help the user improve their life and understand themselves better. You know:
- A list of facts about the user (as system content).
- The full conversation history (as messages).

Instructions:
1. If the user writes something vague or doesn't ask a question, respond with a helpful nudge to get them to ask a clear question. Only return:
  { "answer": "..." }

2. If the user asks a question, respond with:
  {
    "answer": "your main advice or response",
    "reasoning": "why you gave that advice, referencing user facts when helpful",
    "followup": "ask the user for more info to improve future advice"
  }

Always respond with only valid JSON.
`.trim()

  // Build the messages array with proper types
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
