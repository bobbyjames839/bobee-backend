"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const firebaseAdmin_1 = require("../../firebaseAdmin");
const authenticate_1 = require("../../middleware/authenticate");
const router = express_1.default.Router();
router.get('/', authenticate_1.authenticate, async (req, res) => {
    try {
        const { uid } = req;
        const userSnap = await firebaseAdmin_1.db.collection('users').doc(uid).get();
        if (!userSnap.exists)
            return res.json({ suggestions: [], microChallenge: null });
        const data = userSnap.data() || {};
        const ai = data.aiInsights || {};
        const suggestions = Array.isArray(ai.suggestions) ? ai.suggestions.filter((s) => typeof s === 'string') : [];
        const microChallenge = typeof ai.microChallenge === 'string' ? ai.microChallenge : null;
        const reflectionQuestion = typeof ai.reflectionQuestion === 'string' ? ai.reflectionQuestion : "What are you grateful for today?";
        const reflectionOptions = Array.isArray(ai.reflectionOptions)
            ? ai.reflectionOptions.filter((o) => o && typeof o.text === 'string').map((o) => ({ text: o.text }))
            : [];
        const reflectionCompleted = data.reflectionCompleted === true;
        return res.json({ suggestions, microChallenge, reflectionQuestion, reflectionOptions, reflectionCompleted });
    }
    catch (e) {
        console.error('[aiInsights] error', e);
        return res.status(500).json({ error: 'failed' });
    }
});
exports.default = router;
