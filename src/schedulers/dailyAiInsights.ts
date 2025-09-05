import cron from 'node-cron';
import admin from 'firebase-admin';
import { db } from '../firebaseAdmin';
import fetch from 'cross-fetch';

interface JournalDoc {
  id: string;
  transcript: string;
  createdAt?: admin.firestore.Timestamp;
  aiResponse?: any;
}

interface GeneratedInsightsSimple {
  suggestions: string[]; // exactly 3
  microChallenge: string;
}

async function fetchRecentJournals(userId: string, limit = 3): Promise<JournalDoc[]> {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('journals')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

function buildPrompt(journals: JournalDoc[]) {
  const blocks = journals.map((j, idx) => `Journal ${idx + 1} (id=${j.id}):\n${j.transcript}`);
  return `You create a DAILY INSIGHT PACK from up to the three most recent user journal entries.\nReturn ONLY valid compact JSON with this exact shape and nothing else: { "suggestions": string[3], "microChallenge": string }\nDefinitions:\n- suggestions: EXACTLY 3 short, actionable, empathetic forward-looking suggestions (max 140 chars each). No numbering, no quotes inside the string, no emojis, no titles—just plain advice sentences or imperatives. Avoid generic platitudes. Vary the opening verbs.\n- microChallenge: ONE concrete doable task (<10 min) beginning with an imperative verb (e.g., "Write", "List", "Walk", "Identify"). Must be specific and not trivial like deep breathing only.\nRules:\n- Avoid medical or diagnostic language.\n- No meta commentary.\n- If journals are sparse, still produce meaningful generic but supportive guidance.\n\nRecent journals:\n${blocks.join('\n\n')}\n\nJSON:`;
}

async function generateInsights(journals: JournalDoc[]): Promise<GeneratedInsightsSimple> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = buildPrompt(journals);
  const payload = {
    model,
    temperature: 0.7,
    max_tokens: 600,
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
  return { suggestions, microChallenge: micro };
}

async function writeInsights(userId: string, base: GeneratedInsightsSimple) {
  // Store directly on the user document under aiInsights field (no subcollection/doc 'daily')
  await db.collection('users').doc(userId).set({
    aiInsights: {
      suggestions: base.suggestions,
      microChallenge: base.microChallenge,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
  }, { merge: true });
}

export function scheduleDailyAiInsights() {
  cron.schedule('01 19 * * *', async () => {
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

// Optional on-demand helper (could be imported in a route later)
export async function runDailyAiInsightsOnceForUser(userId: string) {
  const journals = await fetchRecentJournals(userId, 3);
  if (!journals.length) throw new Error('No journals');
  const insights = await generateInsights(journals);
  await writeInsights(userId, insights);
  return insights;
}
