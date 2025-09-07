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
// GET metadata only: returns lastBobeeMessage timestamp (epoch ms or null)
router.get('/', authenticate_1.authenticate, async (req, res) => {
    try {
        const uid = req.uid;
        const userRef = db.collection('users').doc(uid);
        const snap = await userRef.get();
        if (!snap.exists)
            return res.status(404).json({ error: 'user-not-found' });
        const data = snap.data() || {};
        const lbm = data.lastBobeeMessage;
        let epoch = null;
        if (lbm && typeof lbm.toMillis === 'function')
            epoch = lbm.toMillis();
        else if (typeof lbm === 'number')
            epoch = lbm;
        return res.json({ lastBobeeMessage: epoch });
    }
    catch (e) {
        console.error('bobeeMessageMeta GET error', e);
        return res.status(500).json({ error: 'internal' });
    }
});
exports.default = router;
