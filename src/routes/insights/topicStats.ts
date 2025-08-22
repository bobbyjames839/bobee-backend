import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

router.use(authenticate)

router.use((req: Request & { uid?: string }, res: Response, next) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!
    const snap = await db.collection('users').doc(uid).get();
    const data = snap.exists && snap.data()?.topics ? snap.data()!.topics : {};
    const topics = Object.entries(data)
      .map(([topic, count]) => ({ topic, count: count as number }))
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    res.json({ topics });
  } catch (err) {
    console.error('Error fetching topicsStats:', err)
    res.status(500).json({ error: 'Failed to read topics' })
  }
})

export default router
