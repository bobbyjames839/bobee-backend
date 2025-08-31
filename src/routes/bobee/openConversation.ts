import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'

export interface HistoryItem {
  question: string
  answer: string
}

const router = Router()
const db = admin.firestore()

router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const uid = (req as AuthenticatedRequest).uid
      const { id } = req.params

      const docRef = db
        .collection('users')
        .doc(uid)
        .collection('conversations')
        .doc(id)
      const snap = await docRef.get()

      if (!snap.exists) {
        return res.status(404).json({ message: 'Conversation not found' })
      }

      const data = snap.data()!
      const history: HistoryItem[] = []
      let idx = 1

      while (true) {
        const qKey = `message${idx}`
        const aKey = `message${idx + 1}`
        if (!(qKey in data)) break

        const question = data[qKey] as string
        const answerObj = (data[aKey] as Record<string, any>) || {}

        history.push({
          question,
          answer: String(answerObj.answer || ''),
        })

        idx += 2
      }

      res.json({ history })
    } catch (err) {
      console.error('Error fetching conversation:', err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

export default router
