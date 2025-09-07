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
        const journalsRef = db
            .collection('users')
            .doc(uid)
            .collection('journals')
            .orderBy('createdAt', 'desc');
        const snap = await journalsRef.get();
        const journals = snap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate().toISOString() ?? null,
            };
        });
        return res.json(journals);
    }
    catch (err) {
        console.error('Error fetching journals:', err);
        return res.status(500).json({ error: 'Failed to fetch journals' });
    }
});
exports.default = router;
