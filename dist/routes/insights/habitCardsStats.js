"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const authenticate_1 = require("../../middleware/authenticate");
const router = (0, express_1.Router)();
const db = firebase_admin_1.default.firestore();
router.use(authenticate_1.authenticate);
router.use((req, res, next) => {
    if (!req.uid) {
        return res.status(401).json({ error: 'Unauthorized – missing UID' });
    }
    next();
});
router.get('/', async (req, res) => {
    try {
        const uid = req.uid;
        // 1) Read existing habit stats
        const userRef = db.collection('users').doc(uid);
        const snap = await userRef.get();
        const base = snap.exists ? snap.data() : {};
        const totalWords = base.journalStats?.totalWords || 0;
        const totalEntries = base.journalStats?.totalEntries || 0;
        const currentStreak = base.journalStats?.streak || 0;
        // 2) Compute avg mood over the past 3 days (72 hours)
        const since = firebase_admin_1.default.firestore.Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
        // Primary location: users/{uid}/journals
        let jSnap = await db
            .collection('users').doc(uid)
            .collection('journals')
            .where('createdAt', '>=', since)
            .orderBy('createdAt', 'desc')
            .get();
        // Fallback: top-level 'journals' with userId
        if (jSnap.empty) {
            jSnap = await db
                .collection('journals')
                .where('userId', '==', uid)
                .where('createdAt', '>=', since)
                .orderBy('createdAt', 'desc')
                .get();
        }
        let sum = 0;
        let count = 0;
        jSnap.forEach(doc => {
            const val = doc.get('aiResponse.moodScore');
            if (typeof val === 'number') {
                sum += val;
                count += 1;
            }
        });
        const avgMoodLast3Days = count > 0 ? Number((sum / count).toFixed(2)) : null;
        // 3) Build hourly histogram (local user timezone not known; use UTC hour from createdAt)
        const allJournalsSnap = await db
            .collection('users').doc(uid)
            .collection('journals')
            .orderBy('createdAt', 'desc')
            .limit(500) // cap for performance
            .get();
        const hours = new Array(24).fill(0);
        const londonHourFormatter = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' });
        allJournalsSnap.forEach(doc => {
            const ts = doc.get('createdAt');
            if (ts && typeof ts.toDate === 'function') {
                const d = ts.toDate();
                // Convert to Europe/London hour (handles DST)
                let h = 0;
                try {
                    const parts = londonHourFormatter.formatToParts(d);
                    const hourPart = parts.find(p => p.type === 'hour');
                    if (hourPart)
                        h = parseInt(hourPart.value, 10) || 0;
                }
                catch (_) {
                    h = d.getUTCHours();
                }
                hours[h] += 1;
            }
        });
        res.json({ totalWords, totalEntries, currentStreak, avgMoodLast3Days, hourlyHistogram: hours });
    }
    catch (err) {
        console.error('Error fetching HabitCards stats:', err);
        res.status(500).json({ error: 'Failed to read HabitCards stats' });
    }
});
exports.default = router;
