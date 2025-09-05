import cron from 'node-cron';
import { db } from '../firebaseAdmin';
import admin from 'firebase-admin';

export function scheduleStreakReset() {
  cron.schedule('0 0 * * *', async () => {
    const now = new Date();
    try {
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const usersSnap = await db.collection('users').get();
      const batch = db.batch();
      let changes = 0;
      usersSnap.forEach(doc => {
        const data = doc.data() || {};
        const last = data.lastJournalDate && typeof data.lastJournalDate.toDate === 'function'
          ? data.lastJournalDate.toDate() as Date
          : null;
        const currentStreak = data.journalStats?.streak ?? 0;
        if (!last || last.getTime() < cutoff.getTime()) {
          if (currentStreak !== 0) {
            const ref = doc.ref;
            batch.set(ref, {
              journalStats: {
                ...(data.journalStats || {}),
                streak: 0,
              },
              lastStreakResetAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            changes++;
          }
        }
      });
      if (changes > 0) {
        await batch.commit();
        console.log(`[streakReset] Reset ${changes} user streak(s)`);
      } else {
        console.log('[streakReset] No streaks to reset');
      }
    } catch (e) {
      console.error('[streakReset] Error resetting streaks', e);
    }
  }, {
    timezone: 'Europe/London'
  });
}
