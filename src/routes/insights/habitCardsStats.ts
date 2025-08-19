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

    // 1) Read existing habit stats
  const userRef = db.collection('users').doc(uid)
  const snap = await userRef.get()
  const base = snap.exists ? snap.data()! : {}

  const totalWords = base.journalStats?.totalWords || 0
  const totalEntries = base.journalStats?.totalEntries || 0
  const currentStreak = base.journalStats?.streak || 0

    // 2) Compute avg mood over the past 3 days (72 hours)
    const since = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    )

    // Primary location: users/{uid}/journals
    let jSnap = await db
      .collection('users').doc(uid)
      .collection('journals')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .get()

    // Fallback: top-level 'journals' with userId
    if (jSnap.empty) {
      jSnap = await db
        .collection('journals')
        .where('userId', '==', uid)
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'desc')
        .get()
    }

    let sum = 0
    let count = 0
    jSnap.forEach(doc => {
      const val = doc.get('aiResponse.moodScore')
      if (typeof val === 'number') {
        sum += val
        count += 1
      }
    })
    const avgMoodLast3Days = count > 0 ? Number((sum / count).toFixed(2)) : null

    res.json({ totalWords, totalEntries, currentStreak, avgMoodLast3Days })
  } catch (err) {
    console.error('Error fetching HabitCards stats:', err)
    res.status(500).json({ error: 'Failed to read HabitCards stats' })
  }
})

export default router
