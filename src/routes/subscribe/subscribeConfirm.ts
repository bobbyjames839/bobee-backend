/* ========== Backend: src/routes/subscribeConfirm.ts ========== */
import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import Stripe from 'stripe';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();
const db = admin.firestore();

// IMPORTANT: pin the API version so TypeScript knows about snake_case fields like `current_period_end`.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

/**
 * POST /api/subscribe/confirm
 * Creates a billable subscription using the card just saved via PaymentSheet (setup mode).
 * Env needed: STRIPE_PRO_PRICE_ID=price_xxx
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    if (!uid) return res.status(401).json({ error: 'Unauthorized – missing UID' });

    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) return res.status(500).json({ error: 'Server missing STRIPE_PRO_PRICE_ID' });

    // Load user & customerId
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });

    const userData = userSnap.data()!;
    const customerId = userData.stripeCustomerId as string | undefined;
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer on file' });

    // Find the most recently attached card payment method
    const pms = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 10,
    });
    if (!pms.data.length) {
      return res.status(400).json({ error: 'No card on file. Please add a card first.' });
    }
    const latestPm = pms.data.sort((a, b) => (b.created || 0) - (a.created || 0))[0];

    // Set default payment method for invoices
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: latestPm.id },
    });

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      expand: ['latest_invoice.payment_intent'],
    });

    const status = subscription.status; // 'active' | 'trialing' | 'incomplete' | ...

    // current_period_end is a Unix timestamp (seconds). Convert to ms for Firestore/JS dates.
    // With the pinned API version above, TS should recognize this field.
    const currentPeriodEnd =
    typeof (subscription as any).current_period_end === 'number'
        ? (subscription as any).current_period_end * 1000
        : null;


    const isSubscribed = status === 'active' || status === 'trialing';

    await userRef.update({
      isSubscribed,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: currentPeriodEnd,
      defaultPaymentMethodId: latestPm.id,
    });

    return res.json({
      subscriptionId: subscription.id,
      status,
      currentPeriodEnd,
    });
  } catch (err: any) {
    console.error('[subscribe/confirm] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

export default router;
