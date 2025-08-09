import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

router.use(authenticate)

router.use((req: Request & { uid?: string }, res: Response, next) => {
  if (!req.uid) return res.status(401).json({ error: 'Unauthorized – missing UID' })
  next()
})

router.delete('/:id', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!
    const id = req.params.id

    await db.collection('users').doc(uid).collection('conversations').doc(id).delete()

    res.json({ success: true })
  } catch (e) {
    console.error('Error deleting conversation:', e)
    res.status(500).json({ error: 'Delete failed' })
  }
})

export default router
