import { Router, Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'
import { decrypt } from '../../utils/encryption'

const router = Router()
const db = admin.firestore()

router.use(authenticate)

router.use((req: Request & { uid?: string }, res: Response, next: NextFunction) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  console.log('Received request to get journals by date');
  try {
    const uid = req.uid!
    const dateString = req.query.date as string

    if (!dateString) {
      return res.status(400).json({ error: 'Missing date parameter (format: YYYY-MM-DD)' })
    }

    // Parse the date and create start/end timestamps
    const targetDate = new Date(dateString)
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format (expected: YYYY-MM-DD)' })
    }

    targetDate.setHours(0, 0, 0, 0)
    const dayEnd = new Date(targetDate)
    dayEnd.setHours(23, 59, 59, 999)

    // Fetch journals for this specific day
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('journals')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(targetDate))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
      .orderBy('createdAt', 'desc')
      .get()

    const journals = snap.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        transcript: data.transcript ? decrypt(data.transcript) : '',
        prompt: data.prompt ? decrypt(data.prompt) : '',
        aiResponse: data.aiResponse ? {
          summary: data.aiResponse.summary ? decrypt(data.aiResponse.summary) : '',
          nextStep: data.aiResponse.nextStep ? decrypt(data.aiResponse.nextStep) : '',
          moodScore: data.aiResponse.moodScore,
          feelings: data.aiResponse.feelings,
          topic: data.aiResponse.topic,
          selfInsight: data.aiResponse.selfInsight ? decrypt(data.aiResponse.selfInsight) : '',
          thoughtPattern: data.aiResponse.thoughtPattern ? decrypt(data.aiResponse.thoughtPattern) : '',
          personalityDeltas: data.aiResponse.personalityDeltas
        } : null,
        createdAt: data.createdAt?.toDate().toISOString() ?? null,
      }
    })

    return res.json(journals)
  } catch (err) {
    console.error('Error fetching journals by date:', err)
    return res.status(500).json({ error: 'Failed to fetch journals' })
  }
})

export default router
