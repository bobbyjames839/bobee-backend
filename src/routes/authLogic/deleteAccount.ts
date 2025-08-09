import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { authenticate } from '../../middleware/authenticate';

type AuthedRequest = Request & { uid?: string };

const router = Router();
const db = admin.firestore();
const auth = admin.auth();

router.use(authenticate);

router.use((req: AuthedRequest, res: Response, next) => {
  if (!req.uid) return res.status(401).json({ error: 'Unauthorized – missing UID' });
  next();
});

async function deleteByQuery(q: FirebaseFirestore.Query, chunkSize = 300) {

  while (true) {
    const snap = await q.limit(chunkSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    await new Promise(r => setTimeout(r, 30));
  }
}

router.delete('/', async (req: AuthedRequest, res: Response) => {
  const uid = req.uid!;
  try {
    const journalsQ = db.collection('journals').where('userId', '==', uid);
    await deleteByQuery(journalsQ);
    await db.collection('users').doc(uid).delete().catch(() => {});
    await auth.deleteUser(uid);

    return res.status(204).send();
  } catch (e) {
    console.error('Delete account failed:', e);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
