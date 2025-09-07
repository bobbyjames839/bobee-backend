"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebaseAdmin_1 = require("../../firebaseAdmin");
const authenticate_1 = require("../../middleware/authenticate");
const router = (0, express_1.Router)();
router.post('/', authenticate_1.authenticate, async (req, res) => {
    console.log('[checkVoiceUsage] secondsUsed:', req.body.secondsUsed);
    const { secondsUsed } = req.body;
    if (typeof secondsUsed !== 'number') {
        return res.status(400).json({ error: 'secondsUsed must be a number' });
    }
    const uid = req.uid;
    const userRef = firebaseAdmin_1.db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const data = userSnap.exists ? userSnap.data() || {} : {};
    const todayStr = new Date().toISOString().split('T')[0];
    let alreadyUsed = 0;
    if (data.voiceUsage?.date === todayStr) {
        alreadyUsed = data.voiceUsage.totalSeconds;
    }
    const isSubscribed = data.subscribe?.subscribed === true;
    const limit = isSubscribed ? 300 : 120;
    const newTotal = alreadyUsed + secondsUsed;
    if (newTotal > limit) {
        console.log(`[checkVoiceUsage] limit exceeded for ${uid}: ${newTotal}/${limit}`);
        return res.status(403).json({
            error: 'Daily voice limit exceeded',
            limit,
            used: alreadyUsed,
        });
    }
    console.log(`[checkVoiceUsage] allowed for ${uid}: ${newTotal}/${limit}`);
    return res.status(200).json({ allowed: true, limit, used: newTotal });
});
exports.default = router;
