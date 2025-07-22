import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

// 1) first, verify & attach uid
router.use(authenticate)

// 2) now guard on req.uid just in case
router.use((req: Request & { uid?: string }, res: Response, next) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!
    const convsSnap = await db
      .collection('users').doc(uid)
      .collection('conversations')
      .orderBy('createdAt', 'desc')
      .get()

    const conversations = convsSnap.docs.map(docSnap => ({
      id: docSnap.id,
      title: (docSnap.data().title as string) || 'Untitled',
      createdAt: docSnap.data().createdAt.toDate().toISOString(),
    }))

    res.json({ conversations })
  } catch (e) {
    console.error('Error fetching conversations:', e)
    res.status(500).json({ error: 'Failed to load conversations' })
  }
})

export default router
