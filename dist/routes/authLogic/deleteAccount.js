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
const auth = firebase_admin_1.default.auth();
router.use(authenticate_1.authenticate);
router.use((req, res, next) => {
    if (!req.uid)
        return res.status(401).json({ error: 'Unauthorized – missing UID' });
    next();
});
async function deleteByQuery(q, chunkSize = 300) {
    while (true) {
        const snap = await q.limit(chunkSize).get();
        if (snap.empty)
            break;
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        await new Promise(r => setTimeout(r, 30));
    }
}
router.delete('/', async (req, res) => {
    const uid = req.uid;
    try {
        const journalsQ = db.collection('journals').where('userId', '==', uid);
        await deleteByQuery(journalsQ);
        await db.collection('users').doc(uid).delete().catch(() => { });
        await auth.deleteUser(uid);
        return res.status(204).send();
    }
    catch (e) {
        console.error('Delete account failed:', e);
        return res.status(500).json({ error: 'Failed to delete account' });
    }
});
exports.default = router;
