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
        const now = new Date();
        const out = {
            '7d': { labels: [], values: [] },
            '28d': { labels: [], values: [] },
        };
        for (const key of ['7d', '28d']) {
            const days = key === '7d' ? 7 : 28;
            const start = new Date(now);
            start.setDate(now.getDate() - days);
            const snap = await db
                .collection('users').doc(uid)
                .collection('journals')
                .where('createdAt', '>=', firebase_admin_1.default.firestore.Timestamp.fromDate(start))
                .get();
            const byDay = {};
            snap.docs.forEach(doc => {
                const data = doc.data();
                const score = data.aiResponse?.moodScore;
                const ts = data.createdAt?.toDate?.();
                if (score != null && ts) {
                    const day = ts.toISOString().slice(0, 10);
                    (byDay[day] || (byDay[day] = [])).push(score);
                }
            });
            const labels = [];
            const values = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(now.getDate() - i);
                const iso = d.toISOString().slice(0, 10);
                labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
                const arr = byDay[iso] || [];
                values.push(arr.length
                    ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1))
                    : null);
            }
            out[key] = {
                labels: key === '28d'
                    ? labels.map((l, idx) => idx % 4 === 0 ? l : '')
                    : labels,
                values,
            };
        }
        res.json(out);
    }
    catch (err) {
        console.error('Error fetching moodChartStats:', err);
        res.status(500).json({ error: 'Failed to read moodChartStats' });
    }
});
exports.default = router;
