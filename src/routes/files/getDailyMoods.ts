import { Router, Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

router.use(authenticate)

router.use((req: Request & { uid?: string }, res: Response, next: NextFunction) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

interface DailyMood {
  date: string
  averageMood: number
  journalCount: number
}

router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!

    // Fetch all daily moods for this user
    const dailyMoodsSnap = await db
      .collection('users')
      .doc(uid)
      .collection('dailyMoods')
      .orderBy('date', 'desc')
      .get()

    const dailyMoods: Record<string, number> = {}

    dailyMoodsSnap.docs.forEach(doc => {
      const data = doc.data() as DailyMood
      dailyMoods[data.date] = data.averageMood
    })

    return res.status(200).json({ dailyMoods })
  } catch (error) {
    console.error('[getDailyMoods] Error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
