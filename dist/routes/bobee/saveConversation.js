"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const cross_fetch_1 = __importDefault(require("cross-fetch"));
const router = (0, express_1.Router)();
const db = firebase_admin_1.default.firestore();
const getConversationTitle = async (userId, conversationText) => {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!conversationText || !conversationText.trim()) {
        throw new Error('Conversation text is required for titling');
    }
    const systemPrompt = `
  You are Bobee’s Title Generator.  
  Your only task is to read a user–AI chat transcript and produce a very short (max 6 words) descriptive title.  
  Respond with exactly and only:
    { "title": "..." }
  `.trim();
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationText.trim() },
    ];
    const res = await (0, cross_fetch_1.default)('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4.1-mini',
            temperature: 0.7,
            messages,
        }),
    });
    if (!res.ok) {
        throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('Empty response from OpenAI');
    }
    let parsed;
    try {
        parsed = JSON.parse(content);
    }
    catch (err) {
        console.error('Failed to parse title JSON:', err, '\nAI response:', content);
        throw new Error('Malformed JSON in title response');
    }
    if (!parsed.title || typeof parsed.title !== 'string') {
        throw new Error('AI did not return a valid title');
    }
    return parsed.title.trim();
};
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing or invalid Authorization header' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decoded = await firebase_admin_1.default.auth().verifyIdToken(idToken);
        req.uid = decoded.uid;
        next();
    }
    catch (err) {
        console.error('Token verification failed', err);
        res.status(401).json({ message: 'Unauthorized' });
    }
}
router.post('/', verifyToken, async (req, res) => {
    try {
        const uid = req.uid;
        const { conversationId, transcript, history } = req.body;
        const title = await getConversationTitle(uid, transcript);
        const payload = {
            title,
            transcript,
            updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
        };
        history.forEach((item, idx) => {
            const qKey = `message${idx * 2 + 1}`;
            const aKey = `message${idx * 2 + 2}`;
            payload[qKey] = item.question;
            payload[aKey] = { answer: item.answer ?? '' };
        });
        const convs = db
            .collection('users')
            .doc(uid)
            .collection('conversations');
        let docRef;
        if (conversationId) {
            docRef = convs.doc(conversationId);
            await docRef.update(payload);
        }
        else {
            docRef = await convs.add({
                createdAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
                ...payload,
            });
        }
        res.json({ conversationId: docRef.id });
    }
    catch (err) {
        console.error('Error saving conversation:', err);
        res.status(500).json({ message: 'Server error' });
    }
});
exports.default = router;
