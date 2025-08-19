/* ========== Backend: src/routes/subscribeFinalize.ts ========== */
import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import Stripe from 'stripe'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
})

/**
 * POST /api/subscribe/finalize
 * Body: { subscriptionId: string }
 * Reads subscription status and updates Firestore.
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest
    if (!uid) return res.status(401).json({ error: 'Unauthorized – missing UID' })

    const { subscriptionId } = req.body as { subscriptionId: string }
    if (!subscriptionId) return res.status(400).json({ error: 'Missing subscriptionId' })

    const sub = await stripe.subscriptions.retrieve(subscriptionId)

    const status = sub.status // 'active' | 'trialing' | 'incomplete' | 'past_due' | ...
    const currentPeriodEnd =
      typeof (sub as any).current_period_end === 'number'
        ? (sub as any).current_period_end * 1000
        : null

    const isSubscribed = status === 'active' || status === 'trialing'

    console.log(status, 'status')

  // Only update the subscribed bool in users/{uid}
  const userRef = db.collection('users').doc(uid)
  await userRef.set({ subscribe: { subscribed: isSubscribed } }, { merge: true })
  

    return res.json({ status, currentPeriodEnd })
  } catch (err: any) {
    console.error('[subscribe/finalize] error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
})

export default router
