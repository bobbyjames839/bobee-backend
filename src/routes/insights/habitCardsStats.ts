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
    const statsRef = db
      .collection('users').doc(uid)
      .collection('metrics').doc('stats')

    const snap = await statsRef.get()
    if (!snap.exists) {
      return res.json({
        totalWords: 0,
        totalEntries: 0,
        currentStreak: 0,
      })
    }

    const data = snap.data()!
    const totalWords = data.totalWords || 0
    const totalEntries = data.totalEntries || 0
    const currentStreak = data.currentStreak || 0

    res.json({ totalWords, totalEntries, currentStreak })
  } catch (err) {
    console.error('Error fetching HabitCards stats:', err)
    res.status(500).json({ error: 'Failed to read HabitCards stats' })
  }
})

export default router
