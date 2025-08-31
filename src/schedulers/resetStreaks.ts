import cron from 'node-cron';
import { db } from '../firebaseAdmin';
import admin from 'firebase-admin';

/**
 * Runs daily at midnight Europe/London time.
 * Logic: For each user, if lastJournalDate is null OR older than 24h relative to now (London),
 * set journalStats.streak = 0 (if not already 0) and optionally store lastStreakReset.
 */
export function scheduleStreakReset() {
  // “0 0 * * *” at 00:00 daily. Using Europe/London to handle DST automatically.
  cron.schedule('0 18 * * *', async () => {
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
