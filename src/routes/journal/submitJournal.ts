import express from 'express';
import admin from 'firebase-admin';

const router = express.Router();
const db = admin.firestore();
// userProfile processing removed

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
  selfInsight?: string;
  thoughtPattern?: string;
  personalityDeltas?: Record<string, number>;
};

router.post('/', async (req, res) => {
  // Voice usage update removed as requested
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
  const { personalityDeltas } = aiResponse;
    const entryRef = await db
      .collection('users')
      .doc(userId)
      .collection('journals')
      .add({
        transcript,
        prompt,
        aiResponse: {
          summary: aiResponse.summary,
          nextStep: aiResponse.nextStep,
          moodScore: aiResponse.moodScore,
          feelings: aiResponse.feelings,
          topic: aiResponse.topic,
          selfInsight: aiResponse.selfInsight,
          thoughtPattern: aiResponse.thoughtPattern,
          personalityDeltas: aiResponse.personalityDeltas
        },
        createdAt: admin.firestore.Timestamp.now(),
      });

    // — 2️⃣ Compute & update writing stats
    const wordCount = transcript.trim().split(/\s+/).length;
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    // prepare for streak calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    let currentStreak = 1;
    if (userSnap.exists) {
      const data = userSnap.data()!;
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
    // Update journalStats object
    const prevStats = userSnap.exists && userSnap.data()?.journalStats ? userSnap.data()!.journalStats : { streak: 0, totalEntries: 0, totalWords: 0 };
    await userRef.set(
      {
        journalStats: {
          streak: currentStreak,
          totalEntries: (prevStats.totalEntries || 0) + 1,
          totalWords: (prevStats.totalWords || 0) + wordCount,
        },
        lastJournalDate: admin.firestore.Timestamp.fromDate(new Date()),
      },
      { merge: true }
    );

  // — 3️⃣ userProfile update removed (newFacts functionality deleted)

    // — 4️⃣ Increment topic frequency
    const userSnap3 = await userRef.get();
    const prevTopics = userSnap3.exists && userSnap3.data()?.topics ? userSnap3.data()!.topics : {};
    await userRef.set(
      {
        topics: {
          ...prevTopics,
          [aiResponse.topic]: (prevTopics?.[aiResponse.topic] || 0) + 1,
        },
      },
      { merge: true }
    );

    // — 5️⃣ Personality & deltas
    if (personalityDeltas) {
      const userSnap4 = await userRef.get();
      const prevScores = userSnap4.exists && userSnap4.data()?.personality ? userSnap4.data()!.personality : {};
      // Calculate new personality by applying deltas
      const newPersonality: Record<string, number> = {};
      PERSONALITY_KEYS.forEach((key) => {
        const prev = prevScores[key] || 50;
        const delta = personalityDeltas[key] || 0;
        newPersonality[key] = Math.max(0, Math.min(100, prev + delta));
      });
      // Save deltas and new personality
      await userRef.set(
        {
          personality: newPersonality,
          personalityDeltas: personalityDeltas,
        },
        { merge: true }
      );
    }

    // — 6️⃣ Update voice usage if timerSeconds is provided
    if (typeof timerSeconds === 'number') {
      const todayStr = new Date().toISOString().split('T')[0];
      const userSnap5 = await userRef.get();
      const prevVoiceUsage = userSnap5.exists && userSnap5.data()?.voiceUsage ? userSnap5.data()!.voiceUsage : { date: todayStr, totalSeconds: 0 };
      let alreadyUsed = 0;
      if (prevVoiceUsage.date === todayStr) {
        alreadyUsed = prevVoiceUsage.totalSeconds;
      }
      const newTotal = alreadyUsed + timerSeconds;
      await userRef.set({
        voiceUsage: { date: todayStr, totalSeconds: newTotal }
      }, { merge: true });
    }

    // — 7️⃣ All done!
    return res.status(200).json({
      entryId: entryRef.id,
      wordCount,
      currentStreak,
      personalityDeltas: personalityDeltas || null,
    });
  } catch (error) {
    console.error('Error in unified /api/journal:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
