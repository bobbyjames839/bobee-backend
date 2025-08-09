import { Router, RequestHandler, Response } from 'express'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'
import { db } from '../../firebaseAdmin'

const router = Router()

const getUserFacts: RequestHandler = async (req, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest

    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('metrics')
      .doc('facts')
      .get()

    const facts = snap.exists
      ? (snap.data()?.facts as string[] | undefined) || null
      : null

    res.json({ facts })
  } catch (err) {
    console.error('Error loading user facts:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

router.get('/', authenticate, getUserFacts)

export default router
