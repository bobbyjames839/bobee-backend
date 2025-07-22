// src/routes/personality.ts
import express, { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';
import { db } from '../../firebaseAdmin';

const router: Router = express.Router(); // use express.Router()

// Personality trait keys and defaults
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

// Helper to build a default scores object
function makeDefaultScores(): PersonalityScores {
  return PERSONALITY_KEYS.reduce((acc, key) => {
    acc[key] = DEFAULT_SCORE;
    return acc;
  }, {} as PersonalityScores);
}

// Shared routine to fetch or initialize scores
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

  // Initialize and persist defaults if no doc
  const defaults = makeDefaultScores();
  await docRef.set(defaults);
  return defaults;
}

/**
 * GET /api/personality
 * — returns existing scores or initializes to all-50s
 */
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

/**
 * POST /api/personality
 * — merge-update the personality blob
 */
router.post(
  '/',
  authenticate,
  express.json(), // ensure body is parsed
  async (req: Request, res: Response) => {
    const { uid } = req as AuthenticatedRequest;
    const updates = req.body.personality as Partial<PersonalityScores>;

    // Validate payload keys
    if (
      typeof updates !== 'object' ||
      !Object.keys(updates).every(k => PERSONALITY_KEYS.includes(k as Trait))
    ) {
      return res.status(400).json({ error: 'Invalid personality payload' });
    }

    const docRef = db
      .collection('users')
      .doc(uid)
      .collection('metrics')
      .doc('personality');

    try {
      await docRef.set(updates, { merge: true });
      return res.json({ success: true });
    } catch (err: any) {
      console.error('Error updating personality:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

export default router;
