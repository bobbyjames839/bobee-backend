import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const auth = admin.auth()

router.use(authenticate)

router.use((req: Request & { uid?: string }, res: Response, next) => {
  if (!req.uid) return res.status(401).json({ error: 'Unauthorized – missing UID' })
  next()
})

router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    return res.json({ ok: true, uid: req.uid })
  } catch (err) {
    console.error('Session check failed:', err)
    return res.status(500).json({ error: 'Session check failed' })
  }
})

export default router
