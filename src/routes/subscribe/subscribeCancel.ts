/* ========== Backend: src/routes/subscribeCancel.ts ========== */
import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import Stripe from 'stripe';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();
const db = admin.firestore();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

/**
 * POST /api/subscribe/cancel
 * Cancels the customer's most recent active/trialing subscription at period end,
 * and stores cancelDate in Firestore (ms since epoch).
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    if (!uid) return res.status(401).json({ error: 'Unauthorized – missing UID' });

    // Load user root doc to find Stripe customer
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });

    const customerId = userSnap.data()?.stripeCustomerId as string | undefined;
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer on file' });

    // Find most recent active/trialing subscription
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
    });

    const candidate = subs.data
      .filter(s => s.status === 'active' || s.status === 'trialing')
      .sort((a, b) => (b.created || 0) - (a.created || 0))[0];

    if (!candidate) {
      return res.status(404).json({ error: 'No active or trialing subscription to cancel' });
    }

    // Schedule cancel at period end
    await stripe.subscriptions.update(candidate.id, { cancel_at_period_end: true });

    // Retrieve fresh subscription to ensure period fields are populated
    const sub = await stripe.subscriptions.retrieve(candidate.id);

    // Prefer current_period_end; fall back to trial_end; finally cancel_at if present
    const sec =
      (typeof (sub as any).current_period_end === 'number' && (sub as any).current_period_end) ||
      (typeof (sub as any).trial_end === 'number' && (sub as any).trial_end) ||
      (typeof (sub as any).cancel_at === 'number' && (sub as any).cancel_at) ||
      null;

    const cancelDate = sec ? sec * 1000 : null; // ms

  // Write cancelDate to Firestore (users/{uid})
  const userRef = db.collection('users').doc(uid);
  await userRef.set({ subscribe: { cancelDate } }, { merge: true });

    return res.json({
      id: sub.id,
      status: sub.status,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      currentPeriodEnd: cancelDate, // ms
    });
  } catch (err: any) {
    console.error('[subscribe/cancel] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

export default router;
