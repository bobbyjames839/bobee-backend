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
// GET /api/settings/get-personality-data
router.get('/', async (req, res) => {
    try {
        const uid = req.uid;
        if (!uid)
            return res.status(401).json({ error: 'unauthorized' });
        const factsRef = db.collection('users').doc(uid).collection('userProfile').doc('facts');
        const statusRef = db.collection('users').doc(uid).collection('userProfile').doc('status');
        const [factsSnap, statusSnap] = await Promise.all([
            factsRef.get(),
            statusRef.get()
        ]);
        const factsRaw = factsSnap.exists ? (factsSnap.data()?.facts || []) : [];
        const facts = factsRaw
            .filter(f => f && typeof f.text === 'string')
            .map(f => f.text.trim())
            .filter(Boolean);
        const personalityParagraph = statusSnap.exists
            ? (statusSnap.data()?.statusParagraph || '')
            : '';
        return res.json({ facts, personality: personalityParagraph });
    }
    catch (err) {
        console.error('userData route error', err);
        return res.status(500).json({ error: 'internal' });
    }
});
exports.default = router;
