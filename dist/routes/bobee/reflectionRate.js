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
        const { uid } = req;
        const { reflectionQuestion, selectedOption, userReply, aiFollowup, aiFinal } = req.body;
        if (!reflectionQuestion || !selectedOption || !userReply || !aiFollowup || !aiFinal) {
            return res.status(400).json({ error: 'missing-fields' });
        }
        const today = new Date().toISOString().split('T')[0];
        const prompt = `You are evaluating a SHORT two-turn self-reflection.
Reflection question: "${reflectionQuestion}"
Initial user option: "${selectedOption}"
AI follow-up: "${aiFollowup}"
User reply: "${userReply}"
AI closing: "${aiFinal}"
Provide a JSON object ONLY like: {"score": number (1-5), "label": string}
Scoring rubric: 1 = avoidant/minimal, 2 = brief surface, 3 = some emotional/insight effort, 4 = good depth + actionable intent, 5 = strong self-awareness + constructive next steps. Use whole numbers only. Label is 2-4 words summarizing user's engagement quality. No extra text.`;
        const { answer } = await (0, getAIResponse_1.getBobeeAnswer)(uid, prompt);
        let parsed = {};
        try {
            parsed = JSON.parse(answer);
        }
        catch {
            parsed = {};
        }
        const score = typeof parsed.score === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.score))) : 3;
        const label = typeof parsed.label === 'string' ? parsed.label.slice(0, 40) : 'Engaged';
        // Write rating doc
        const ref = db.collection('users').doc(uid);
        await ref.set({
            reflectionCompleted: true,
            reflectionRatings: { [today]: { score, label, updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp() } }
        }, { merge: true });
        return res.json({ score, label });
    }
    catch (e) {
        console.error('reflectionRate error', e);
        return res.status(500).json({ error: 'server-error' });
    }
});
exports.default = router;
