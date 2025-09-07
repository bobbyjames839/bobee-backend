"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authenticate_1 = require("../../middleware/authenticate");
const firebaseAdmin_1 = require("../../firebaseAdmin");
const router = express_1.default.Router();
router.get('/', authenticate_1.authenticate, async (req, res) => {
    const { uid } = req;
    try {
        const userRef = firebaseAdmin_1.db.collection('users').doc(uid);
        const snap = await userRef.get();
        if (!snap.exists)
            throw new Error('User not found');
        const data = snap.data() || {};
        const personality = data.personality;
        console.log('Personality scores for', uid, personality);
        return res.json({ personality });
    }
    catch (err) {
        console.error('Error fetching personality:', err);
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
