import express, { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';
import { db } from '../../utils/firebaseAdmin';

const router: Router = express.Router(); 


router.get(
  '/',
  authenticate,
  async (req: Request, res: Response) => {

    const { uid } = req as AuthenticatedRequest;

    try {
      const userRef = db.collection('users').doc(uid);
      const snap = await userRef.get();
      if (!snap.exists) throw new Error('User not found');
      const data = snap.data() || {};
      const personality = data.personality;
      console.log('Personality scores for', uid, personality);
      return res.json({ personality });
    } catch (err: any) {
      console.error('Error fetching personality:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);


export default router;
