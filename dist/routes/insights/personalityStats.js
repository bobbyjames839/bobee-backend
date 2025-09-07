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
        const userRef = db.collection('users').doc(uid);
        const snap = await userRef.get();
        const data = snap.exists ? snap.data() : {};
        const personality = data.personality || {};
        const deltas = data.personalityDeltas || {};
        const personalityStats = {};
        for (const key of ['resilience', 'discipline', 'focus', 'selfWorth', 'confidence', 'clarity']) {
            const raw = typeof personality[key] === 'number' ? personality[key] : 50;
            const value = Math.round(raw);
            const delta = typeof deltas[key] === 'number' ? deltas[key] : 0;
            personalityStats[key] = { value, delta };
        }
        res.json({ personalityStats });
    }
    catch (err) {
        console.error('Error fetching personalityStats:', err);
        res.status(500).json({ error: 'Failed to read personalityStats' });
    }
});
exports.default = router;
