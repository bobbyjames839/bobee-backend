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
  const userRef = db.collection('users').doc(uid)
  const snap = await userRef.get()
  const data = snap.exists ? snap.data()! : {}
  const personality = data.personality || {}
  const deltas = data.personalityDeltas || {}

    const personalityStats: Record<string, { value: number; delta: number }> = {}
    for (const key of ['resilience','discipline','focus','selfWorth','confidence','clarity'] as const) {
      const raw = typeof personality[key] === 'number' ? personality[key] : 50
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
