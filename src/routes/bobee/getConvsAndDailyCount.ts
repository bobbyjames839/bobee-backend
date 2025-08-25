import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

router.use(authenticate)

router.use((req: Request & { uid?: string }, res: Response, next) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!

    const limit = Math.min(parseInt(String((req.query?.limit ?? '50')), 10) || 50, 200)

    const convsRef = db
      .collection('users').doc(uid)
      .collection('conversations')
      .orderBy('createdAt', 'desc')
      .limit(limit)

  // Fetch conversations list and the root user doc (which stores conversationUsage).
  // Previously this endpoint looked for conversationUsage in users/{uid}/metrics/stats,
  // but chat.ts and signUp.ts write conversationUsage on the root user document.
  // That mismatch caused todayCount to remain 0 in the quota bar.
  const userRef = db.collection('users').doc(uid)
  const [convsSnap, userSnap] = await Promise.all([convsRef.get(), userRef.get()])

    const conversations = convsSnap.docs.map(docSnap => {
      const d = docSnap.data() as any
      const createdAt =
        d?.createdAt?.toDate?.() instanceof Date
          ? d.createdAt.toDate().toISOString()
          : new Date(0).toISOString() 
      return {
        id: docSnap.id,
        title: (d?.title as string) || 'Untitled',
        createdAt,
      }
    })

    let todayCount = 0
    if (userSnap.exists) {
      const data = userSnap.data() as any
      const usage = data?.conversationUsage || {}
      // chat.ts uses toLocaleDateString('en-CA') which yields YYYY-MM-DD
      // signUp.ts initializes with new Date().toISOString().split('T')[0]
      // Normalize by slicing ISO string of now to 10 chars.
      const todayStr = new Date().toISOString().slice(0, 10)
      todayCount = usage.date === todayStr ? (usage.count || 0) : 0
    }

    res.json({ conversations, todayCount })
  } catch (e) {
    console.error('Error fetching conversations overview:', e)
    res.status(500).json({ error: 'Failed to load conversations overview' })
  }
})

export default router
