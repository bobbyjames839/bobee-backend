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
        const { uid } = req;
        if (!uid)
            return res.status(401).json({ error: 'Unauthorized – missing UID' });
        const userRef = db.collection('users').doc(uid);
        const snap = await userRef.get();
        const data = snap.exists ? snap.data() || {} : {};
        const entitlement = data.entitlement;
        const isSubscribed = Boolean(entitlement && typeof entitlement.expiresAt === 'number' && entitlement.expiresAt > Date.now());
        res.set('Cache-Control', 'no-store');
        return res.json({ isSubscribed, source: isSubscribed ? 'apple' : null });
    }
    catch (err) {
        console.error('[subscribe/status] error:', err);
        return res.status(500).json({ error: err.message || 'Internal error' });
    }
});
exports.default = router;
