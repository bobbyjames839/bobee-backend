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

interface GeneratedInsights {
  suggestions: { title: string; detail: string }[];
  microChallenge: string;
  sourceJournalIds: string[];
  generatedAt: admin.firestore.FieldValue;
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
  return `You are an assistant that creates concise daily guidance for a returning journaling user.\nGiven up to the three most recent journal entries, produce: \n1. EXACTLY three actionable, empathetic suggestion objects focussed on forward movement (not generic platitudes).\n2. ONE micro challenge (a single, concrete task doable today in < 5 minutes).\nRules:\n- Suggestions: each has a short title (max 6 words) and a detail (max 160 chars).\n- Avoid repeating the same verb openers.\n- Be gentle, non-clinical, no diagnosis, no promises.\n- Micro challenge: start with an imperative verb.\nReturn ONLY valid JSON matching this TypeScript type: { suggestions: { title: string; detail: string }[]; microChallenge: string; }\nIf journals are fewer than three or very short, still produce output.\n\nRecent journals:\n${blocks.join('\n\n')}\n\nJSON:`;
}

async function generateInsights(journals: JournalDoc[]): Promise<Omit<GeneratedInsights, 'generatedAt' | 'sourceJournalIds'>> {
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
  try { parsed = JSON.parse(raw); } catch {
    parsed = { suggestions: [], microChallenge: 'Take one deep mindful breath.' };
  }
  if (!Array.isArray(parsed.suggestions)) parsed.suggestions = [];
  // Normalise length
  parsed.suggestions = parsed.suggestions.slice(0,3);
  while (parsed.suggestions.length < 3) {
    parsed.suggestions.push({ title: 'Reflect briefly', detail: 'Take 60 seconds to notice how you feel before continuing your day.' });
  }
  if (typeof parsed.microChallenge !== 'string') parsed.microChallenge = 'Stand, stretch, and take 3 slow breaths.';
  return parsed as { suggestions: { title: string; detail: string }[]; microChallenge: string };
}

async function writeInsights(userId: string, base: Omit<GeneratedInsights, 'generatedAt' | 'sourceJournalIds'>, journalIds: string[]) {
  const ref = db.collection('users').doc(userId).collection('aiInsights').doc('daily');
  const payload: GeneratedInsights = {
    ...base,
    sourceJournalIds: journalIds,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(payload, { merge: false });
}

export function scheduleDailyAiInsights() {
  // Run at 05:05 Europe/London daily (after streak reset)
  cron.schedule('18 25 * * *', async () => {
    console.log('[dailyAiInsights] job start');
    try {
      // Stream users in batches to avoid memory blow-up
      const usersSnap = await db.collection('users').get();
      let processed = 0;
      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        try {
          const journals = await fetchRecentJournals(userId, 3);
            if (!journals.length) continue; // skip users with no journals
          const insights = await generateInsights(journals);
          await writeInsights(userId, insights, journals.map(j => j.id));
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
  await writeInsights(userId, insights, journals.map(j => j.id));
  return insights;
}
