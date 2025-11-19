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

router.put('/', async (req: AuthedRequest, res: Response) => {
  try {
    const uid = req.uid! // safe because of the middleware above
    const { style, creativity } = req.body as Partial<AIPersonality>

    // Validate input
    if (!style || typeof creativity !== 'number') {
      return res.status(400).json({ error: 'Invalid personality data' })
    }

    if (creativity < 0 || creativity > 100) {
      return res.status(400).json({ error: 'Creativity must be between 0 and 100' })
    }

    const validStyles = ['friendly', 'direct', 'coaching', 'analytical', 'fun', 'supportive']
    if (!validStyles.includes(style)) {
      return res.status(400).json({ error: 'Invalid style' })
    }

    // Update in Firestore
    await db
      .collection('users')
      .doc(uid)
      .set(
        {
          aiPersonality: {
            style,
            creativity,
          },
        },
        { merge: true }
      )

    return res.status(200).json({ 
      success: true,
      aiPersonality: { style, creativity }
    })
  } catch (error) {
    console.error('[updateAiPersonality] Error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
