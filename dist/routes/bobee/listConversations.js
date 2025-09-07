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
router.get('/', authenticate_1.authenticate, async (req, res) => {
    try {
        const uid = req.uid;
        const convsSnap = await db.collection('users').doc(uid).collection('conversations')
            .orderBy('updatedAt', 'desc').limit(50).get();
        const conversations = convsSnap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                title: (data.title || 'Untitled').toString(),
                createdAt: data.createdAt?.toMillis?.() || data.updatedAt?.toMillis?.() || Date.now(),
                updatedAt: data.updatedAt?.toMillis?.() || null,
            };
        });
        res.json({ conversations });
    }
    catch (e) {
        console.error('listConversations error', e);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
