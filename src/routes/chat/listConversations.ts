import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();
const db = admin.firestore();

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const uid = (req as AuthenticatedRequest).uid;
    
    // Fetch from conversationTitles subcollection instead
    const titlesSnap = await db
      .collection('users')
      .doc(uid)
      .collection('conversationTitles')
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();
    
    const conversations = titlesSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        title: (data.title || 'Untitled').toString(),
        createdAt: data.createdAt?.toMillis?.() || Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() || null,
      };
    });
    
    res.json({ conversations });
  } catch (e) {
    console.error('listConversations error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;