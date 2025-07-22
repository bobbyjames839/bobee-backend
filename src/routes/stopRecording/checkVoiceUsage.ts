import { Router, Request, Response } from 'express';
import { db } from '../../firebaseAdmin';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();

router.post(
  '/',
  authenticate,
  async (req: Request, res: Response) => {
    // Log incoming request
    console.log('[checkVoiceUsage] secondsUsed:', req.body.secondsUsed);

    const { secondsUsed } = req.body;
    if (typeof secondsUsed !== 'number') {
      return res.status(400).json({ error: 'secondsUsed must be a number' });
    }

    const uid = (req as AuthenticatedRequest).uid;
    const statsRef = db
      .collection('users')
      .doc(uid)
      .collection('metrics')
      .doc('stats');
    const statsSnap = await statsRef.get();

    const todayStr = new Date().toISOString().split('T')[0];
    let alreadyUsed = 0;
    if (statsSnap.exists) {
      const data = statsSnap.data();
      if (data?.voiceUsage?.date === todayStr) {
        alreadyUsed = data.voiceUsage.totalSeconds;
      }
    }

    const userInfoRef = db
      .collection('users')
      .doc(uid)
      .collection('metrics')
      .doc('userInfo');
    const userInfoSnap = await userInfoRef.get();
    const isSubscribed = userInfoSnap.exists && userInfoSnap.data()?.subscribed === true;

    const limit = isSubscribed ? 600 : 120;
    const newTotal = alreadyUsed + secondsUsed;

    if (newTotal > limit) {
      console.log(`[checkVoiceUsage] limit exceeded for ${uid}: ${newTotal}/${limit}`);
      return res.status(403).json({
        error: 'Daily voice limit exceeded',
        limit,
        used: alreadyUsed,
      });
    }

    await statsRef.set(
      { voiceUsage: { date: todayStr, totalSeconds: newTotal } },
      { merge: true }
    );

    console.log(`[checkVoiceUsage] allowed for ${uid}: ${newTotal}/${limit}`);
    return res.status(200).json({ allowed: true, limit, used: newTotal });
  }
);

export default router;
