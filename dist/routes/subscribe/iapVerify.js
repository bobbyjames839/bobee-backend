"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const authenticate_1 = require("../../middleware/authenticate");
const verifyAppleReceipt_1 = require("./verifyAppleReceipt");
const router = (0, express_1.Router)();
const db = firebase_admin_1.default.firestore();
// POST /api/subscribe/iap/verify
// Body: { receiptData: base64 string }
// Stores entitlement in users/{uid}.entitlement (single source of truth for Apple subscription).
router.post('/', authenticate_1.authenticate, async (req, res) => {
    try {
        const { uid } = req;
        if (!uid)
            return res.status(401).json({ error: 'Unauthorized – missing UID' });
        const { receiptData } = req.body;
        if (!receiptData)
            return res.status(400).json({ error: 'Missing receiptData' });
        const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET;
        if (!sharedSecret)
            return res.status(500).json({ error: 'Server missing APPLE_IAP_SHARED_SECRET' });
        const productIds = (process.env.APPLE_IAP_PRODUCT_IDS || 'com.bobee.pro.monthly')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        const verifyResp = await (0, verifyAppleReceipt_1.verifyAppleReceipt)({ receiptData, sharedSecret });
        if (verifyResp.status !== 0) {
            return res.status(400).json({ error: 'Invalid receipt', status: verifyResp.status, environment: verifyResp.environment });
        }
        const sub = (0, verifyAppleReceipt_1.extractLatestForProducts)(verifyResp, productIds);
        if (!sub) {
            return res.status(404).json({ error: 'No matching subscription in receipt', environment: verifyResp.environment });
        }
        // Minimal persistence strategy:
        // 1. Store current entitlement under users/{uid}.entitlement (cache + quick lookup for unified-status)
        // 2. Maintain a reverse mapping appleEntitlements/{originalTransactionId} -> { uid, lastSeen } to prevent cross‑account replay.
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        const existing = userDoc.exists ? (userDoc.data() || {}) : {};
        const previouslyBoundOtid = existing.entitlement?.originalTransactionId;
        const otid = sub.originalTransactionId;
        const reverseRef = db.collection('appleEntitlements').doc(otid);
        const reverseSnap = await reverseRef.get();
        const reverseData = reverseSnap.exists ? reverseSnap.data() || {} : {};
        const mappedUid = reverseData.uid;
        if (mappedUid && mappedUid !== uid) {
            // If OTID already mapped to another uid, reject to avoid sharing. (Adjust policy as needed.)
            return res.status(409).json({ error: 'original_transaction_id already bound to another account' });
        }
        if (previouslyBoundOtid && previouslyBoundOtid !== otid) {
            console.warn(`[iap/verify] uid ${uid} presented different original_transaction_id. Had ${previouslyBoundOtid}, now ${otid}`);
        }
        const entitlement = {
            platform: 'apple',
            productId: sub.productId,
            originalTransactionId: sub.originalTransactionId,
            expiresAt: sub.expiresAt,
            isActive: sub.isActive,
            isInBillingRetry: sub.isInBillingRetry || false,
            lastVerifiedAt: Date.now(),
            environment: verifyResp.environment || 'unknown',
        };
        await userRef.set({ entitlement }, { merge: true });
        await reverseRef.set({ uid, lastSeen: Date.now(), productId: sub.productId }, { merge: true });
        res.set('Cache-Control', 'no-store');
        return res.json({ entitlement, subscribed: sub.isActive });
    }
    catch (err) {
        console.error('[iap/verify] error:', err);
        return res.status(500).json({ error: err.message || 'Internal error' });
    }
});
exports.default = router;
