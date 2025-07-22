// src/routes/journal.ts
import express from 'express';
import admin from 'firebase-admin';

const router = express.Router();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// If you have a fixed list of personality keys, define them here.
// Otherwise you can replace this with Object.keys(aiData.personality).
const PERSONALITY_KEYS = [
  'resilience',
  'discipline',
  'focus',
  'selfWorth',
  'confidence',
  'clarity',
];

type AIResponse = {
  summary: string;
  nextStep: string;
  moodScore: number;
  feelings: string[];
  topic: string;
  personality?: Record<string, number>;
  newFacts?: string[];
};

router.post('/', async (req, res) => {
  try {
    const {
      userId,
      transcript,
      prompt = '',
      aiResponse,
      timerSeconds,
    }: {
      userId: string;
      transcript: string;
      prompt?: string;
      aiResponse: AIResponse;
      timerSeconds?: number;
    } = req.body;

    // — validate
    if (!userId || !transcript || !aiResponse) {
      return res
        .status(400)
        .json({ error: 'Missing userId, transcript or aiResponse' });
    }

    // — 1️⃣ Save journal entry
    const { newFacts = [], ...aiData } = aiResponse;
    const entryRef = await db
      .collection('users')
      .doc(userId)
      .collection('journals')
      .add({
        transcript,
        prompt,
        aiResponse: aiData,
        createdAt: admin.firestore.Timestamp.now(),
      });

    // — 2️⃣ Compute & update writing stats
    const wordCount = transcript.trim().split(/\s+/).length;

    const statsRef = db
      .collection('users')
      .doc(userId)
      .collection('metrics')
      .doc('stats');
    const statsSnap = await statsRef.get();

    // prepare for streak calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let currentStreak = 1;
    if (statsSnap.exists) {
      const data = statsSnap.data()!;
      const fsDate = data.lastJournalDate;
      const lastDate =
        fsDate && typeof fsDate.toDate === 'function'
          ? fsDate.toDate()
          : null;

      if (lastDate) {
        lastDate.setHours(0, 0, 0, 0);
        if (lastDate.getTime() === yesterday.getTime()) {
          currentStreak = (data.currentStreak || 0) + 1;
        } else if (lastDate.getTime() === today.getTime()) {
          currentStreak = data.currentStreak || 1;
        }
      }
    }

    await statsRef.set(
      {
        wordCount,
        currentStreak,
        lastJournalDate: admin.firestore.Timestamp.fromDate(new Date()),
        ...(typeof timerSeconds === 'number' && { timerSeconds }),
      },
      { merge: true }
    );

    // — 3️⃣ Persist newFacts
    if (newFacts.length > 0) {
      const factsRef = db
        .collection('users')
        .doc(userId)
        .collection('metrics')
        .doc('facts');
      const factsSnap = await factsRef.get();

      if (factsSnap.exists) {
        await factsRef.update({
          facts: FieldValue.arrayUnion(...newFacts),  // now safe: at least one element
        });
      } else {
        await factsRef.set({ facts: newFacts });
      }
    }

    // — 4️⃣ Increment topic frequency
    const topicRef = db
      .collection('users')
      .doc(userId)
      .collection('metrics')
      .doc('topics');
    await topicRef.set(
      { [aiData.topic]: FieldValue.increment(1) },
      { merge: true }
    );

    // — 5️⃣ Personality & deltas
    if (aiData.personality) {
      const personalityRef = db
        .collection('users')
        .doc(userId)
        .collection('metrics')
        .doc('personality');
      const prevSnap = await personalityRef.get();
      const prevScores = prevSnap.exists
        ? (prevSnap.data() as Record<string, number>)
        : {};

      const deltas: Record<string, number> = {};
      PERSONALITY_KEYS.forEach((key) => {
        deltas[key] =
          (aiData.personality![key] || 0) - (prevScores[key] || 0);
      });

      await personalityRef.set(aiData.personality);
      await db
        .collection('users')
        .doc(userId)
        .collection('metrics')
        .doc('personalityDeltas')
        .set(deltas);
    }

    // — 6️⃣ All done!
    return res.status(200).json({
      entryId: entryRef.id,
      wordCount,
      currentStreak,
    });
  } catch (error) {
    console.error('Error in unified /api/journal:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
