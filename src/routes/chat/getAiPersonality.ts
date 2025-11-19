import { Router, Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

// All routes in this router require authentication
router.use(authenticate)

interface AuthedRequest extends Request {
  uid?: string
}

router.use((req: AuthedRequest, res: Response, next: NextFunction) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

interface AIPersonality {
  style: string
  creativity: number
}

router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    const uid = req.uid! // safe because of the middleware above

    const dataSnap = await db
      .collection('users')
      .doc(uid)
      .get()

    const aiPersonality = dataSnap.data()?.aiPersonality as AIPersonality | undefined

    return res.status(200).json({ AIPersonality: aiPersonality })
  } catch (error) {
    console.error('[getAiPersonality] Error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
