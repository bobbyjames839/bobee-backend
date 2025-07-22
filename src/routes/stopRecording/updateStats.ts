import express from 'express';
import admin from 'firebase-admin';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { journal, userId } = req.body;

    if (!journal || typeof journal !== 'string' || !userId) {
      return res.status(400).json({ error: 'Missing journal or userId' });
    }

    const wordCount = journal.trim().split(/\s+/).length;
    const statsRef = admin.firestore().doc(`users/${userId}/metrics/stats`);
    const statsSnap = await statsRef.get();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let currentStreak = 1;

    if (statsSnap.exists) {
      const data = statsSnap.data();
      if (data) {
        const firestoreDate = data.lastJournalDate;
        const lastJournalDate =
          firestoreDate && typeof firestoreDate.toDate === 'function'
            ? firestoreDate.toDate()
            : null;

        if (lastJournalDate) {
          lastJournalDate.setHours(0, 0, 0, 0);

          if (lastJournalDate.getTime() === yesterday.getTime()) {
            currentStreak = (data.currentStreak || 0) + 1;
          } else if (lastJournalDate.getTime() === today.getTime()) {
            currentStreak = data.currentStreak || 1;
          }
        }
      }
    }

    await statsRef.set(
      {
        wordCount,
        currentStreak,
        lastJournalDate: admin.firestore.Timestamp.fromDate(new Date()),
      },
      { merge: true }
    );

    return res.json({ wordCount, currentStreak });
  } catch (err) {
    console.error('update-stats error:', err);
    return res.status(500).json({ error: 'Failed to update stats' });
  }
});

export default router;
