// functions/src/routes/mainScreen/metrics.ts
import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

// 1) Verify & attach uid
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
 * → { todayCount: number }
 */
router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!
    const statsRef = db
      .collection('users').doc(uid)
      .collection('metrics').doc('stats')

    const snap = await statsRef.get()
    if (!snap.exists) {
      return res.json({ todayCount: 0 })
    }

    const data = snap.data()!
    const usage = data.conversationUsage || {}
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayCount = usage.date === todayStr ? (usage.count || 0) : 0

    res.json({ todayCount })
  } catch (err) {
    console.error('Error fetching todayCount:', err)
    res.status(500).json({ error: 'Failed to read metrics' })
  }
})

export default router
