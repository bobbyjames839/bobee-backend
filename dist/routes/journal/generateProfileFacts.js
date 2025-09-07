"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../middleware/authenticate");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const router = (0, express_1.Router)();
const db = firebase_admin_1.default.firestore();
router.post('/', authenticate_1.authenticate, async (req, res) => {
    try {
        const { transcript = '', prompt = '' } = req.body || {};
        if (!transcript || typeof transcript !== 'string' || transcript.trim().split(/\s+/).length < 3) {
            return res.status(400).json({ error: 'transcript-too-short' });
        }
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_API_KEY)
            return res.status(500).json({ error: 'missing-openai-key' });
        const uid = req.uid;
        const factsRef = db.collection('users').doc(uid).collection('userProfile').doc('facts');
        const statusRef = db.collection('users').doc(uid).collection('userProfile').doc('status');
        // Load existing data
        const [factsSnap, statusSnap] = await Promise.all([factsRef.get(), statusRef.get()]);
        const rawFacts = factsSnap.exists ? (factsSnap.data()?.facts || []) : [];
        const existingFacts = rawFacts
            .filter(f => f && typeof f.text === 'string')
            .map(f => {
            let createdAt;
            const ca = f.createdAt;
            if (ca && typeof ca.toMillis === 'function')
                createdAt = ca.toMillis();
            else if (typeof ca === 'number')
                createdAt = ca;
            else
                createdAt = Date.now();
            return { text: f.text, createdAt };
        });
        const existingFactTexts = existingFacts.map(f => f.text);
        const previousStatus = statusSnap.exists ? (statusSnap.data()?.statusParagraph || '') : '';
        // -------- SINGLE CALL: Update facts & status together --------
        const systemPrompt = [
            'You are an assistant inside a personal journaling app. The user writes journal entries over time. We maintain a small structured store of durable user facts and a reflective status paragraph derived ONLY from accumulated journal content (never outside knowledge).',
            '',
            'You perform TWO coordinated tasks and return ONLY one JSON object:',
            '{',
            '  "updatedFacts": string[],',
            '  "statusParagraph": string',
            '}',
            '',
            'INPUT FIELDS:',
            '- existingFacts: array of objects { text, createdAt } (epoch ms).',
            '- previousStatusParagraph: prior reflective paragraph.',
            '- transcript: latest journal entry.',
            '- optionalPrompt: optional extra context.',
            '',
            'TASK 1 (updatedFacts):',
            '• Preserve only generic, enduring, verifiable facts (profession, roles, long-term pursuits, clearly stated stable preferences).',
            '• No transient moods/emotions/time-specific states.',
            '• If transcript contradicts a fact, remove or replace it.',
            '• Add new facts ONLY if explicitly supported (no speculation).',
            '• Keep facts unique, present tense, neutral (e.g. "User is a software engineer").',
            '• If nothing to change, keep as-is.',
            '',
            'TASK 2 (statusParagraph):',
            '• ≤ 150 words, empathetic reflective description of current state (themes, challenges, tone).',
            '• Maintain still-valid context from previous journals unless contradicted.',
            '• Remove/adjust lines explicitly disproved.',
            '• No advice / instructions / bullet lists / biography facts.',
            '• Neutral supportive tone; no diagnosis; avoid speculation.',
            '• If too little new detail (<10 meaningful words), reuse previous paragraph (or default if empty: "Not enough detail to summarize yet.").',
            '',
            'GENERAL RULES:',
            '• Output ONLY JSON, no code fences, no extra text.',
            '• Keys exactly: updatedFacts, statusParagraph (in that order).',
            '• Do not invent names or facts not present.',
        ].join('\n');
        const userPayload = {
            existingFacts,
            previousStatusParagraph: previousStatus,
            transcript,
            optionalPrompt: prompt || null
        };
        const aiResp = await (0, node_fetch_1.default)('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                temperature: 0.3,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(userPayload) }
                ]
            })
        });
        if (!aiResp.ok) {
            return res.status(500).json({ error: 'openai-error', status: aiResp.status });
        }
        const aiData = await aiResp.json();
        const raw = (aiData.choices?.[0]?.message?.content || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        let updatedFacts = existingFactTexts;
        let newStatus = previousStatus || 'Not enough detail to summarize yet.';
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.updatedFacts)) {
                updatedFacts = parsed.updatedFacts
                    .filter((f) => typeof f === 'string' && f.trim())
                    .map((f) => f.trim()); // no max cap currently
            }
            if (parsed && typeof parsed.statusParagraph === 'string' && parsed.statusParagraph.trim()) {
                newStatus = parsed.statusParagraph.trim().slice(0, 700);
            }
        }
        catch {
            // fallback uses existing values
        }
        // Diff facts
        const updatedSet = new Set(updatedFacts);
        const removed = existingFactTexts.filter(f => !updatedSet.has(f));
        const existingSet = new Set(existingFactTexts);
        const added = updatedFacts.filter(f => !existingSet.has(f));
        // Merge timestamps
        const nowTs = Date.now();
        const keptMap = new Map(existingFacts.map(f => [f.text, f.createdAt || nowTs]));
        const finalFacts = updatedFacts.map(text => ({ text, createdAt: keptMap.get(text) || nowTs }));
        // Firestore writes (single batch)
        const batch = db.batch();
        // Only write facts if changed
        if (added.length || removed.length || !factsSnap.exists) {
            const finalFactsForWrite = finalFacts.map(f => ({ text: f.text, createdAt: firebase_admin_1.default.firestore.Timestamp.fromMillis(f.createdAt) }));
            batch.set(factsRef, { facts: finalFactsForWrite }, { merge: true });
        }
        if (newStatus !== previousStatus) {
            batch.set(statusRef, { statusParagraph: newStatus, updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
        await batch.commit();
        return res.json({
            ok: true,
            facts: {
                total: finalFacts.length,
                addedCount: added.length,
                removedCount: removed.length,
                added,
                removed
            },
            status: {
                updated: newStatus !== previousStatus,
                statusParagraph: newStatus
            }
        });
    }
    catch (err) {
        console.error('generate-profile-facts error:', err);
        return res.status(500).json({ error: 'internal' });
    }
});
exports.default = router;
