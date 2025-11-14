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
  personalityDeltas: PersonalityScores;
  selfInsight: string;
  thoughtPattern: string;
};

const router = Router();

router.post('/', authenticate, async (req: Request & { uid?: string }, res: Response) => {
  const { journal, prompt, personality } = req.body;
  const uid = req.uid;

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OpenAI API key' });
  }
  
  // Get user profile data if available
  let userProfileData = {};
  try {
    if (uid) {
      const db = require('../../utils/firebaseAdmin').db;
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.userProfile) {
          userProfileData = userData.userProfile;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching user profile:', err);
    // Continue without userProfile if there's an error
  }
  
  // Format the context for the AI with both personality metrics and user profile
  const personalityString = `Personality metrics:\n${JSON.stringify(personality, null, 2)}`;
  const userProfileString = Object.keys(userProfileData).length > 0 ? 
    `\n\nUser Profile:\n${JSON.stringify(userProfileData, null, 2)}` : '';
  
  const combinedContent = prompt
    ? `${personalityString}${userProfileString}\n\nPrompt: ${prompt}\n\nJournal Entry: ${journal}`
    : `${personalityString}${userProfileString}\n\nJournal Entry: ${journal}`;

  const systemPrompt = `
You are Bobee, the insight engine of the Bobee journaling app.

You will receive:
1. Personality metrics - The user's current personality trait scores
2. User Profile (when available) - A structured profile containing:
   - demographics (age, location, occupation, etc.)
   - preferences (likes, dislikes, interests)
   - habits (routines, behaviors)
   - goals (short-term and long-term aspirations)
   - challenges (obstacles, difficulties)
   - achievements (accomplishments, milestones)
   - insights (self-awareness, patterns)
3. Journal Entry - The user's written journal
4. Optional Prompt - A specific journaling prompt if provided

TASKS
1. Validate the entry (must contain at least 2 words).
2. Rate overall mood from 1 (very negative) to 10 (very positive).
3. Output exactly three single-word descriptors that best capture the user's feelings (e.g. ["calm","uncertain","hopeful"]).
4. Write one reflective paragraph (50–70 words) that reads the journal back to the user in a thoughtful and empathetic tone. If the User Profile is available, personalize this based on their demographics, preferences, and insights.
5. Provide one concise "next step" sentence (≤ 20 words) suggesting a simple action the user could try tomorrow. Reference their goals or challenges from the User Profile when possible.
6. Assign a **single-word** topic that best describes the journal entry. Choose from:
   ["emotion","mood","achievement","work","relationships","stress","gratitude","health","productivity","anxiety","growth","money","creativity","reflection","goals"]
7. Based on the content of this journal entry, return **deltas** (positive or negative integer change, e.g. 2, -1, 0) for each personality trait:
  "resilience", "discipline", "focus", "selfWorth", "confidence", "clarity".
  Example: { "resilience": 2, "discipline": -1, ... }
8. Provide a **detailed selfInsight** (2–3 sentences) offering nuanced analysis of recurring themes, emotional shifts, or emerging strengths. Consider trends visible across the user's profile data and personality metrics when available.
9. Detect the primary thought pattern in this entry. Then write a 3–4 sentence paragraph to the user that:
    - Explains how this pattern shows up in the journal text
    - Describes its impact on the user's mindset
    - Suggests one concrete way to reframe or counteract it, tailored to their preferences and goals from the User Profile when available
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
  "personalityDeltas": {
    "resilience": number,
    "discipline": number,
    "focus": number,
    "selfWorth": number,
    "confidence": number,
    "clarity": number
  },
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
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: combinedContent },
        ],
        max_completion_tokens: 700,         
        reasoning_effort: 'low',                
        response_format: { type: 'json_object' } 
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
  personalityDeltas: parsed.personalityDeltas,
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