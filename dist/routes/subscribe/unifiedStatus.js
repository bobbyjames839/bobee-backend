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
// GET /api/subscribe/unified-status
// Combines Stripe flag + Apple entitlement
router.get('/', authenticate_1.authenticate, async (req, res) => {
    try {
        const { uid } = req;
        if (!uid)
            return res.status(401).json({ error: 'Unauthorized – missing UID' });
        const snap = await db.collection('users').doc(uid).get();
        const data = snap.exists ? snap.data() || {} : {};
        const entitlement = data.entitlement || null;
        let appleActive = false;
        let appleExpiresAt = null;
        if (entitlement && typeof entitlement.expiresAt === 'number') {
            appleExpiresAt = entitlement.expiresAt;
            appleActive = entitlement.expiresAt > Date.now();
        }
        const isSubscribed = appleActive;
        const source = appleActive ? 'apple' : null;
        res.set('Cache-Control', 'no-store');
        return res.json({
            isSubscribed,
            source,
            apple: entitlement ? {
                productId: entitlement.productId,
                expiresAt: appleExpiresAt,
                isActive: appleActive,
                environment: entitlement.environment || 'unknown',
            } : null,
            legacy: null,
        });
    }
    catch (err) {
        console.error('[unified-status] error:', err);
        return res.status(500).json({ error: err.message || 'Internal error' });
    }
});
exports.default = router;
