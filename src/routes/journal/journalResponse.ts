import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import { authenticate } from '../../middleware/authenticate';

export type PersonalityScores = {
  resilience: number;
  discipline: number;
  focus: number;
  selfWorth: number;
  confidence: number;
  clarity: number;
};

export type AIResponse = {
  moodScore: number;
  feelings: string[];
  summary: string;
  nextStep: string;
  topic: string;
  personality: PersonalityScores;
  newFacts: string[];
  selfInsight: string;
  thoughtPattern: string;
};

const router = Router();

router.post('/', authenticate, async (req: Request, res: Response) => {
  const { journal, prompt, personality } = req.body;

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OpenAI API key' });
  }

  const personalityString = `Personality metrics:\n${JSON.stringify(personality, null, 2)}`;
  const combinedContent = prompt
    ? `${personalityString}\n\nPrompt: ${prompt}\n\nJournal Entry: ${journal}`
    : `${personalityString}\n\nJournal Entry: ${journal}`;

  const systemPrompt = `
You are Bobee, the insight engine of the Bobee journaling app.

TASKS
1. Validate the entry (must contain at least 2 words).
2. Rate overall mood from 0 (very negative) to 10 (very positive).
3. Output exactly three single-word descriptors that best capture the user’s feelings (e.g. ["calm","uncertain","hopeful"]).
4. Write one reflective paragraph (50–70 words) that reads the journal back to the user in a thoughtful and empathetic tone.
5. Provide one concise “next step” sentence (≤ 20 words) suggesting a simple action the user could try tomorrow.
6. Assign a **single-word** topic that best describes the journal entry. Choose from:
   ["emotion","mood","achievement","work","relationships","stress","gratitude","health","productivity","anxiety","growth","money","creativity","reflection","goals"]
7. Based on the content of this journal entry, return **slightly adjusted** personality scores (0–100 scale) for:
   "resilience", "discipline", "focus", "selfWorth", "confidence", "clarity".
8. Extract any new personal facts you learn about the user, these will be used to provide the user with more personalised advice when they use a chatbot so make sure you only extract facts about them personally (e.g. hobbies, preferences, milestones) **as an array of strings**.
9. Provide a **detailed selfInsight** (2–3 sentences) offering nuanced analysis of recurring themes, emotional shifts, or emerging strengths in the user’s mood and journaling style.
10. Detect the primary thought pattern in this entry. Then write a 3–4 sentence paragraph,that:
   - Explains how this pattern shows up in the journal text
   - Describes its impact on the user’s mindset
   - Suggests one concrete way to reframe or counteract it
   Label this field as thoughtPattern.

OUTPUT  
Return **only** this JSON:

\`\`\`json
{
  "isValidEntry": boolean,
  "moodScore": number,
  "feelings": ["...", "...", "..."],
  "summary": "...",
  "nextStep": "...",
  "topic": "...",
  "personality": {
    "resilience": number,
    "discipline": number,
    "focus": number,
    "selfWorth": number,
    "confidence": number,
    "clarity": number
  },
  "newFacts": ["fact1", "fact2", ...],
  "selfInsight": "...",               
  "thoughtPattern": "..."          
}
\`\`\`

If unusable, respond:

\`\`\`json
{
  "isValidEntry": false,
  "moodScore": 0,
  "feelings": [],
  "summary": "Invalid journal entry.",
  "nextStep": "",
  "topic": "",
  "personality": {
    "resilience": 50,
    "discipline": 50,
    "focus": 50,
    "selfWorth": 50,
    "confidence": 50,
    "clarity": 50
  },
  "newFacts": [],
  "selfInsight": "",
  "thoughtPattern": ""
}
\`\`\`
`.trim();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: combinedContent },
        ],
      }),
    });

    if (!response.ok) {
      return res.status(500).json({ error: `OpenAI error: ${response.status}` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: 'OpenAI returned empty content' });
    }

    const cleaned = content
      .trim()
      .replace(/^```json/, '')
      .replace(/```$/, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      console.error('Failed to parse JSON:', cleaned);
      return res.status(500).json({ error: 'Invalid JSON from OpenAI' });
    }

    if (!parsed || parsed.isValidEntry === false) {
      return res.status(400).json({ error: 'Invalid journal entry' });
    }

    const result: AIResponse = {
      moodScore: parsed.moodScore,
      feelings: parsed.feelings,
      summary: parsed.summary,
      nextStep: parsed.nextStep,
      topic: parsed.topic,
      personality: parsed.personality,
      newFacts: Array.isArray(parsed.newFacts)
        ? parsed.newFacts.filter((f: any) => typeof f === 'string')
        : [],
      selfInsight: parsed.selfInsight,
      thoughtPattern: parsed.thoughtPattern,
    };

    return res.status(200).json({ aiResponse: result });
  } catch (err) {
    console.error('[getAIResponse Error]', err);
    return res.status(500).json({ error: 'Failed to generate AI response' });
  }
});

export default router;
