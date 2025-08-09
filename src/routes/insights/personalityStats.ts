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
    const base = db.collection('users').doc(uid).collection('metrics')

    const [snap, deltaSnap] = await Promise.all([
      base.doc('personality').get(),
      base.doc('personalityDeltas').get(),
    ])

    const data = snap.exists ? snap.data()! : {}
    const deltas = deltaSnap.exists ? deltaSnap.data()! : {}

    const personalityStats: Record<string, { value: number; delta: number }> = {}
    for (const key of ['resilience','discipline','focus','selfWorth','confidence','clarity'] as const) {
      const raw = typeof data[key] === 'number' ? data[key] : 50
      const value = Math.round(raw)
      const delta = typeof deltas[key] === 'number' ? deltas[key] : 0
      personalityStats[key] = { value, delta }
    }

    res.json({ personalityStats })
  } catch (err) {
    console.error('Error fetching personalityStats:', err)
    res.status(500).json({ error: 'Failed to read personalityStats' })
  }
})

export default router
