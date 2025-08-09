import express, { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';
import { db } from '../../firebaseAdmin';

const router: Router = express.Router(); 

const PERSONALITY_KEYS = [
  'resilience',
  'discipline',
  'focus',
  'selfWorth',
  'confidence',
  'clarity',
] as const;
type Trait = typeof PERSONALITY_KEYS[number];
type PersonalityScores = Record<Trait, number>;
const DEFAULT_SCORE = 50;

function makeDefaultScores(): PersonalityScores {
  return PERSONALITY_KEYS.reduce((acc, key) => {
    acc[key] = DEFAULT_SCORE;
    return acc;
  }, {} as PersonalityScores);
}

async function fetchOrInitScores(uid: string): Promise<PersonalityScores> {
  const docRef = db
    .collection('users')
    .doc(uid)
    .collection('metrics')
    .doc('personality');

  const snap = await docRef.get();
  if (snap.exists) {
    const data = snap.data() || {};
    return PERSONALITY_KEYS.reduce((acc, key) => {
      acc[key] = typeof data[key] === 'number' ? data[key] : DEFAULT_SCORE;
      return acc;
    }, {} as PersonalityScores);
  }

  const defaults = makeDefaultScores();
  await docRef.set(defaults);
  return defaults;
}

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response) => {
    const { uid } = req as AuthenticatedRequest;

    try {
      const personality = await fetchOrInitScores(uid);
      return res.json({ personality });
    } catch (err: any) {
      console.error('Error fetching personality:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);


export default router;
