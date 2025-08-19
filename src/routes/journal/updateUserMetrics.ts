import { Router, Request, Response } from 'express';
import { db } from '../../firebaseAdmin';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();

router.post('/', authenticate, async (req: Request, res: Response) => {
  const { secondsUsed } = req.body;
  if (typeof secondsUsed !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid metrics' });
  }

  const uid = (req as AuthenticatedRequest).uid;
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const data = userSnap.exists ? userSnap.data() || {} : {};
  const todayStr = new Date().toISOString().split('T')[0];
  let alreadyUsed = 0;
  if (data.voiceUsage?.date === todayStr) {
    alreadyUsed = data.voiceUsage.totalSeconds;
  }
  const newTotal = alreadyUsed + secondsUsed;

  // Update only voice usage
  await userRef.set({
    voiceUsage: { date: todayStr, totalSeconds: newTotal }
  }, { merge: true });

  return res.status(200).json({ ok: true, totalSeconds: newTotal });
});

export default router;
