import express from 'express';
import { db } from '../../firebaseAdmin';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.json({ suggestions: [], microChallenge: null });
    const data = userSnap.data() || {} as any;
    const ai = data.aiInsights || {};
    const suggestions: string[] = Array.isArray(ai.suggestions) ? ai.suggestions.filter((s: any) => typeof s === 'string') : [];
    const microChallenge = typeof ai.microChallenge === 'string' ? ai.microChallenge : null;
    return res.json({ suggestions, microChallenge });
  } catch (e) {
    console.error('[aiInsights] error', e);
    return res.status(500).json({ error: 'failed' });
  }
});

export default router;