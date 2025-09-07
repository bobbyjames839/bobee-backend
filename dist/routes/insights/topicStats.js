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
        const snap = await db.collection('users').doc(uid).get();
        const data = snap.exists && snap.data()?.topics ? snap.data().topics : {};
        const topics = Object.entries(data)
            .map(([topic, count]) => ({ topic, count: count }))
            .filter(t => t.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        res.json({ topics });
    }
    catch (err) {
        console.error('Error fetching topicsStats:', err);
        res.status(500).json({ error: 'Failed to read topics' });
    }
});
exports.default = router;
