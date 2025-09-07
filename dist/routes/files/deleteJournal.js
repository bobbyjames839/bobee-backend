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
router.delete('/:journalId', async (req, res) => {
    try {
        const uid = req.uid;
        const { journalId } = req.params;
        const journalRef = db
            .collection('users').doc(uid)
            .collection('journals').doc(journalId);
        const userRef = db.collection('users').doc(uid);
        const journalSnap = await journalRef.get();
        if (!journalSnap.exists) {
            return res.status(404).json({ error: 'Journal not found' });
        }
        const journalData = journalSnap.data();
        const topic = journalData.aiResponse?.topic;
        if (topic) {
            const userSnap = await userRef.get();
            const prevTopics = userSnap.exists && userSnap.data()?.topics ? userSnap.data().topics : {};
            await userRef.set({
                topics: {
                    ...prevTopics,
                    [topic]: Math.max(0, (prevTopics?.[topic] || 1) - 1),
                }
            }, { merge: true });
        }
        const userSnap2 = await userRef.get();
        const statsData = userSnap2.exists ? userSnap2.data() : {};
        const lastDate = statsData.lastJournalDate
            ? statsData.lastJournalDate.toDate().setHours(0, 0, 0, 0)
            : null;
        const selDate = journalData.createdAt
            .toDate().setHours(0, 0, 0, 0);
        await journalRef.delete();
        if (lastDate === selDate) {
            const remSnap = await db
                .collection('users').doc(uid)
                .collection('journals')
                .orderBy('createdAt', 'desc')
                .get();
            if (remSnap.empty) {
                await userRef.set({
                    lastJournalDate: firebase_admin_1.default.firestore.Timestamp.fromDate(new Date('2000-01-01')),
                    journalStats: {
                        ...(statsData.journalStats || {}),
                        currentStreak: 0,
                        totalEntries: Math.max(0, (statsData.journalStats?.totalEntries || 1) - 1),
                    }
                }, { merge: true });
            }
            else {
                const nextDate = remSnap.docs[0].data().createdAt.toDate();
                await userRef.set({
                    lastJournalDate: firebase_admin_1.default.firestore.Timestamp.fromDate(nextDate),
                    journalStats: {
                        ...(statsData.journalStats || {}),
                        totalEntries: Math.max(0, (statsData.journalStats?.totalEntries || 1) - 1),
                    }
                }, { merge: true });
            }
        }
        return res.status(204).send();
    }
    catch (err) {
        console.error('Error in deleteJournal:', err);
        return res.status(500).json({ error: 'Failed to delete journal' });
    }
});
exports.default = router;
