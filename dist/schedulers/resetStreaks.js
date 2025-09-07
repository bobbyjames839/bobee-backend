"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleStreakReset = scheduleStreakReset;
const node_cron_1 = __importDefault(require("node-cron"));
const firebaseAdmin_1 = require("../firebaseAdmin");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
function scheduleStreakReset() {
    node_cron_1.default.schedule('0 0 * * *', async () => {
        const now = new Date();
        try {
            const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const usersSnap = await firebaseAdmin_1.db.collection('users').get();
            const batch = firebaseAdmin_1.db.batch();
            let changes = 0;
            usersSnap.forEach(doc => {
                const data = doc.data() || {};
                const last = data.lastJournalDate && typeof data.lastJournalDate.toDate === 'function'
                    ? data.lastJournalDate.toDate()
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
                            lastStreakResetAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
                        }, { merge: true });
                        changes++;
                    }
                }
            });
            if (changes > 0) {
                await batch.commit();
                console.log(`[streakReset] Reset ${changes} user streak(s)`);
            }
            else {
                console.log('[streakReset] No streaks to reset');
            }
        }
        catch (e) {
            console.error('[streakReset] Error resetting streaks', e);
        }
    }, {
        timezone: 'Europe/London'
    });
}
