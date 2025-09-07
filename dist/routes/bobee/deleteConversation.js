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
router.use(authenticate_1.authenticate);
router.use((req, res, next) => {
    if (!req.uid)
        return res.status(401).json({ error: 'Unauthorized – missing UID' });
    next();
});
router.delete('/:id', async (req, res) => {
    try {
        const uid = req.uid;
        const id = req.params.id;
        await db.collection('users').doc(uid).collection('conversations').doc(id).delete();
        res.json({ success: true });
    }
    catch (e) {
        console.error('Error deleting conversation:', e);
        res.status(500).json({ error: 'Delete failed' });
    }
});
exports.default = router;
