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
  try {
    const uid = req.uid!
    const limitParam = req.query.limit as string | undefined
    const limit = limitParam ? parseInt(limitParam, 10) : undefined

    let journalsRef = db
      .collection('users')
      .doc(uid)
      .collection('journals')
      .orderBy('createdAt', 'desc')

    // Apply limit if specified
    if (limit && !isNaN(limit) && limit > 0) {
      journalsRef = journalsRef.limit(limit) as any
    }

    const snap = await journalsRef.get()
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
    console.error('Error fetching journals:', err)
    return res.status(500).json({ error: 'Failed to fetch journals' })
  }
})

export default router
