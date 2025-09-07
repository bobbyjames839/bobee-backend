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
    const reflectionQuestion = typeof ai.reflectionQuestion === 'string' ? ai.reflectionQuestion : "What are you grateful for today?";
    const reflectionOptions = Array.isArray(ai.reflectionOptions)
      ? ai.reflectionOptions.filter((o: any) => o && typeof o.text === 'string' && typeof o.score === 'number').map((o: any) => ({ text: o.text, score: o.score }))
      : [];
    return res.json({ suggestions, microChallenge, reflectionQuestion, reflectionOptions });
  } catch (e) {
    console.error('[aiInsights] error', e);
    return res.status(500).json({ error: 'failed' });
  }
});

export default router;