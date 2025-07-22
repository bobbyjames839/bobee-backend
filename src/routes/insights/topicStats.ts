// functions/src/routes/mainScreen/topicsStats.ts
import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

// 1) Authenticate & attach uid
router.use(authenticate)

// 2) Guard
router.use((req: Request & { uid?: string }, res: Response, next) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

/**
 * GET /
 * → { topics: Array<{ topic: string; count: number }> }
 */
router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!
    const snap = await db
      .collection('users').doc(uid)
      .collection('metrics').doc('topics')
      .get()

    const data = snap.exists ? snap.data()! : {}
    // turn { topic1: count1, topic2: count2 } into array, filter zeros, sort & take top 5
    const topics = Object.entries(data)
      .map(([topic, count]) => ({ topic, count: count as number }))
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    res.json({ topics })
  } catch (err) {
    console.error('Error fetching topicsStats:', err)
    res.status(500).json({ error: 'Failed to read topics' })
  }
})

export default router
