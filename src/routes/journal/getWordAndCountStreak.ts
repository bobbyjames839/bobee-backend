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
    const userRef = admin.firestore().doc(`users/${userId}`);
    const userSnap = await userRef.get();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let currentStreak = 1;
    let lastJournalDate = null;
    if (userSnap.exists) {
      const data = userSnap.data() || {};
      const stats = data.journalStats || {};
      const firestoreDate = data.lastJournalDate;
      lastJournalDate = firestoreDate && typeof firestoreDate.toDate === 'function'
        ? firestoreDate.toDate()
        : null;
      if (lastJournalDate) {
        lastJournalDate.setHours(0, 0, 0, 0);
        if (lastJournalDate.getTime() === yesterday.getTime()) {
          currentStreak = (stats.streak || 0) + 1;
        } else if (lastJournalDate.getTime() === today.getTime()) {
          currentStreak = stats.streak || 1;
        }
      }
    }


  return res.json({ wordCount, currentStreak });
  } catch (err) {
    console.error('update-stats error:', err);
    return res.status(500).json({ error: 'Failed to update stats' });
  }
});

export default router;
