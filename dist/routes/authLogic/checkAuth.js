"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const authenticate_1 = require("../../middleware/authenticate");
const router = (0, express_1.Router)();
const auth = firebase_admin_1.default.auth();
router.use(authenticate_1.authenticate);
router.use((req, res, next) => {
    if (!req.uid)
        return res.status(401).json({ error: 'Unauthorized – missing UID' });
    next();
});
router.get('/', async (req, res) => {
    try {
        return res.json({ ok: true, uid: req.uid });
    }
    catch (err) {
        console.error('Session check failed:', err);
        return res.status(500).json({ error: 'Session check failed' });
    }
});
exports.default = router;
