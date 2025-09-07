"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const authenticate_1 = require("../../middleware/authenticate");
const getAIResponse_1 = require("./getAIResponse");
const router = (0, express_1.Router)();
const db = firebase_admin_1.default.firestore();
router.post('/', authenticate_1.authenticate, async (req, res) => {
    try {
        const { conversationId, question, history } = req.body;
        const uid = req.uid;
        // Check word limit
        const wordCount = [...history, { question, answer: '' }]
            .flatMap(i => [i.question, i.answer || ''])
            .join(' ')
            .split(/\s+/).length;
        if (wordCount > 1500) {
            return res.status(400).json({ error: 'Chat limit reached' });
        }
        // Load user profile facts & status
        let metrics = {};
        try {
            const userProfileCol = db.collection('users').doc(uid).collection('userProfile');
            const [factsSnap, statusSnap] = await Promise.all([
                userProfileCol.doc('facts').get(),
                userProfileCol.doc('status').get()
            ]);
            const factsData = factsSnap.exists ? factsSnap.data() : null;
            const statusData = statusSnap.exists ? statusSnap.data() : null;
            const facts = Array.isArray(factsData?.facts) ? factsData.facts.filter((f) => f && typeof f.text === 'string').map((f) => ({
                text: f.text,
                createdAt: f.createdAt && typeof f.createdAt.toMillis === 'function' ? f.createdAt.toMillis() : undefined
            })) : [];
            metrics = {
                userProfile: {
                    facts: facts.map((f) => f.text),
                    statusParagraph: (statusData?.statusParagraph || '').toString().trim()
                }
            };
        }
        catch (e) {
            console.warn('Failed to load user profile for chat context', e);
        }
        // Format past messages for AI
        const pastMessages = history.flatMap(item => {
            const msgs = [{ role: 'user', content: item.question }];
            if (item.answer)
                msgs.push({ role: 'assistant', content: item.answer });
            return msgs;
        });
        // Get AI response
        const { answer } = await (0, getAIResponse_1.getBobeeAnswer)(uid, question, metrics, pastMessages);
        // Firestore refs
        const convs = db.collection('users').doc(uid).collection('conversations');
        let newId = conversationId;
        // Create payload
        const idx = history.length * 2 + 1;
        const payload = {
            [`message${idx}`]: question,
            [`message${idx + 1}`]: { answer },
            updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
        };
        // Check if new conversation
        const isNewConversation = !conversationId;
        console.log('isNewConversation:', isNewConversation);
        if (isNewConversation) {
            const ref = await convs.add({
                createdAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
                ...payload,
            });
            newId = ref.id;
            // Increment daily usage only for new conversations
            const userRef = db.collection('users').doc(uid);
            const todayStr = new Date().toLocaleDateString('en-CA');
            const snap = await userRef.get();
            let newCount = 1;
            if (snap.exists) {
                const data = snap.data();
                const cu = data.conversationUsage || {};
                newCount = cu.date === todayStr ? (cu.count || 0) + 1 : 1;
            }
            await userRef.set({
                conversationUsage: { date: todayStr, count: newCount }
            }, { merge: true });
        }
        else {
            await convs.doc(conversationId).update(payload);
        }
        res.json({ answer, conversationId: newId });
    }
    catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
