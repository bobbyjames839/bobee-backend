"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const firebaseAdmin_1 = require("../firebaseAdmin");
async function authenticate(req, res, next) {
    const authHeader = req.header('Authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const idToken = match[1];
    try {
        const decoded = await firebaseAdmin_1.authAdmin.verifyIdToken(idToken);
        req.uid = decoded.uid;
        next();
    }
    catch (e) {
        console.error('Auth error', e);
        res.status(401).json({ error: 'Invalid ID token' });
    }
}
