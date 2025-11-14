import cron from 'node-cron';
import admin from 'firebase-admin';
import { db } from '../utils/firebaseAdmin';
import fetch from 'cross-fetch';
import { decrypt } from '../utils/encryption';

interface JournalDoc {
  id: string;
  transcript: string;
  createdAt?: admin.firestore.Timestamp;
  aiResponse?: any;
}

interface ReflectionOption { text: string }
interface GeneratedInsightsSimple {
  suggestions: string[]; // exactly 3
  microChallenge: string;
  reflectionQuestion: string;
  reflectionOptions: ReflectionOption[]; // exactly 4
}

async function fetchRecentJournals(userId: string, limit = 3): Promise<JournalDoc[]> {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('journals')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: d.id,
      transcript: data.transcript ? decrypt(data.transcript) : '',
      createdAt: data.createdAt,
      aiResponse: data.aiResponse
    };
  });
  }

  function buildPrompt(journals: JournalDoc[]) {
  const blocks = journals.map((j, idx) => `Journal ${idx + 1} (id=${j.id}):\n${j.transcript}`);
  return `You create a DAILY INSIGHT PACK from up to the three most recent user journal entries.\nReturn ONLY compact JSON with this shape and NOTHING else: { "suggestions": string[3], "microChallenge": string, "reflectionQuestion": string, "reflectionOptions": [{"text": string}] }\nDefinitions:\n- suggestions: EXACTLY 3 short, actionable, empathetic forward-looking suggestions (max 140 chars each). Plain sentences, no numbering, no emojis.\n- microChallenge: ONE concrete doable task (<10 min) starting with an imperative verb. Specific, not trivial.\n- reflectionQuestion: ONE open-ended question encouraging self-awareness or reframing based on themes.\n- reflectionOptions: EXACTLY 4 distinct possible concise USER ANSWERS (<= 80 chars) the user might select in response to reflectionQuestion. Each option: first-person where natural, no leading punctuation, relevant to the question, varied in tone or perspective (no scoring field).\nRules:\n- Avoid medical or diagnostic language.\n- No meta commentary. Output only JSON.\n- If journals are sparse, fall back to generic wellness-oriented content.\n\nRecent journals:\n${blocks.join('\n\n')}\n\nJSON:`;
}

async function generateInsights(journals: JournalDoc[]): Promise<GeneratedInsightsSimple> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
  const prompt = buildPrompt(journals);
  const payload = {
    model,
    max_completion_tokens: 700,   
    reasoning_effort: 'low',              
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You produce ONLY compact JSON and nothing else.' },
      { role: 'user', content: prompt }
    ],
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`openai-error-${res.status}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '{}';
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  let suggestions: string[] = Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s: any) => typeof s === 'string') : [];
  suggestions = suggestions.slice(0,3);
  const fallbackSuggestions = [
    'List three small wins from this week.',
    'Identify one recurring thought and reframe it more gently.',
    'Write two sentences about what you need tomorrow.'
  ];
  while (suggestions.length < 3) suggestions.push(fallbackSuggestions[suggestions.length]);
  let micro: string = typeof parsed.microChallenge === 'string' ? parsed.microChallenge : 'Write a sticky note with one encouraging phrase and place it where you will see it in the morning.';
  // Basic micro challenge quality guard (length & verb start)
  if (micro.length < 12 || /breath|breathe only/i.test(micro)) {
    micro = 'Take a 7‑minute mindful walk outdoors and note three different sounds you hear.';
  }
  let reflectionQuestion = typeof parsed.reflectionQuestion === 'string' ? parsed.reflectionQuestion : 'What is one new insight you have gained from your recent journaling?';
  if (reflectionQuestion.length < 10) reflectionQuestion = 'What is one new insight you have gained from your recent journaling?';

  let reflectionOptions: ReflectionOption[] = Array.isArray(parsed.reflectionOptions)
    ? parsed.reflectionOptions
        .filter((o: any) => o && typeof o.text === 'string')
        .map((o: any) => ({ text: String(o.text).trim() }))
    : [];
  // Deduplicate by text
  const seen = new Set<string>();
  reflectionOptions = reflectionOptions.filter(o => {
    const key = o.text.toLowerCase();
    if (seen.has(key)) return false; seen.add(key); return true;
  });
  // Ensure 4 options covering a range of scores
  const fallbackSpectrum: ReflectionOption[] = [
    { text: 'I am unsure how to apply this yet.' },
    { text: 'I can try a small change based on this.' },
    { text: 'I feel motivated to act on this insight.' },
    { text: 'I already see how this will help me grow.' },
  ];
  while (reflectionOptions.length < 4 && fallbackSpectrum.length) {
    reflectionOptions.push(fallbackSpectrum.shift()!);
  }
  reflectionOptions = reflectionOptions.slice(0,4);
  // Deduplicate order retained (no scoring sort now)
  return { suggestions, microChallenge: micro, reflectionQuestion, reflectionOptions };
}

async function writeInsights(userId: string, base: GeneratedInsightsSimple) {
  // Store directly on the user document under aiInsights field (no subcollection/doc 'daily')
  await db.collection('users').doc(userId).set({
    aiInsights: {
      suggestions: base.suggestions,
      microChallenge: base.microChallenge,
      reflectionQuestion: base.reflectionQuestion,
      reflectionOptions: base.reflectionOptions,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  reflectionCompleted: false
  }, { merge: true });
}

export function scheduleDailyAiInsights() {
  cron.schedule('05 00 * * *', async () => {
    console.log('[dailyAiInsights] job start');
    try {
      const usersSnap = await db.collection('users').get();
      let processed = 0;
      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        try {
          const journals = await fetchRecentJournals(userId, 3);
            if (!journals.length) continue; 
          const insights = await generateInsights(journals);
          await writeInsights(userId, insights);
          processed++;
        } catch (e) {
          console.error('[dailyAiInsights] user failure', userId, e);
        }
      }
      console.log(`[dailyAiInsights] completed; users updated=${processed}`);
    } catch (e) {
      console.error('[dailyAiInsights] fatal', e);
    }
  }, { timezone: 'Europe/London' });
}


