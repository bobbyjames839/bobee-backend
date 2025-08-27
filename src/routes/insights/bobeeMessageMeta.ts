import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

// GET metadata only: returns lastBobeeMessage timestamp (epoch ms or null)
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const uid = (req as AuthenticatedRequest).uid
    const userRef = db.collection('users').doc(uid)
    const snap = await userRef.get()
    if (!snap.exists) return res.status(404).json({ error: 'user-not-found' })
    const data = snap.data() || {}
    const lbm = data.lastBobeeMessage
    let epoch: number | null = null
    if (lbm && typeof lbm.toMillis === 'function') epoch = lbm.toMillis()
    else if (typeof lbm === 'number') epoch = lbm
    return res.json({ lastBobeeMessage: epoch })
  } catch (e) {
    console.error('bobeeMessageMeta GET error', e)
    return res.status(500).json({ error: 'internal' })
  }
})

export default router
