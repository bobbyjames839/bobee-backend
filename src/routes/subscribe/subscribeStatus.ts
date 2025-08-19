import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();
const db = admin.firestore();


router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    if (!uid) return res.status(401).json({ error: 'Unauthorized – missing UID' });

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    const data = snap.exists ? snap.data() || {} : {};
    const isSubscribed = !!data.subscribe?.subscribed;
    // Keep shape consistent with your frontend: number | false
    const cancelDate =
      typeof data.subscribe?.cancelDate === 'number' ? data.subscribe.cancelDate : false;

    res.set('Cache-Control', 'no-store');
    return res.json({ isSubscribed, cancelDate });
  } catch (err: any) {
    console.error('[subscribe/status] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

export default router;
