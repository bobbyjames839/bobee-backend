import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();
const db = admin.firestore();

router.use(authenticate);

// GET /api/settings/get-personality-data
router.get('/', async (req: Request, res: Response) => {
  try {
    const uid = (req as AuthenticatedRequest).uid;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const factsRef = db.collection('users').doc(uid).collection('userProfile').doc('facts');
    const statusRef = db.collection('users').doc(uid).collection('userProfile').doc('status');
    const [factsSnap, statusSnap] = await Promise.all([
      factsRef.get(),
      statusRef.get()
    ]);

    const factsRaw: any[] = factsSnap.exists ? (factsSnap.data()?.facts || []) : [];
    const facts: string[] = factsRaw
      .filter(f => f && typeof f.text === 'string')
      .map(f => f.text.trim())
      .filter(Boolean);

    const personalityParagraph: string = statusSnap.exists
      ? (statusSnap.data()?.statusParagraph || '')
      : '';

  return res.json({ facts, personality: personalityParagraph });
  } catch (err) {
    console.error('userData route error', err);
    return res.status(500).json({ error: 'internal' });
  }
});

export default router;
