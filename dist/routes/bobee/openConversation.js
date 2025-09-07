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
router.get('/:id', authenticate_1.authenticate, async (req, res) => {
    try {
        const uid = req.uid;
        const { id } = req.params;
        const docRef = db
            .collection('users')
            .doc(uid)
            .collection('conversations')
            .doc(id);
        const snap = await docRef.get();
        if (!snap.exists) {
            return res.status(404).json({ message: 'Conversation not found' });
        }
        const data = snap.data();
        const history = [];
        let idx = 1;
        while (true) {
            const qKey = `message${idx}`;
            const aKey = `message${idx + 1}`;
            if (!(qKey in data))
                break;
            const question = data[qKey];
            const answerObj = data[aKey] || {};
            history.push({
                question,
                answer: String(answerObj.answer || ''),
            });
            idx += 2;
        }
        res.json({ history });
    }
    catch (err) {
        console.error('Error fetching conversation:', err);
        res.status(500).json({ message: 'Server error' });
    }
});
exports.default = router;
