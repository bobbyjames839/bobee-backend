/* ========== Backend: src/routes/subscribe.ts ========== */
import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import Stripe from 'stripe';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();
const db = admin.firestore();

// Initialise Stripe, relying on the account default API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Authentication guard
router.use(authenticate);
router.use((req: Request, res: Response, next) => {
  const { uid } = req as AuthenticatedRequest;
  if (!uid) return res.status(401).json({ error: 'Unauthorized – missing UID' });
  next();
});

/**
 * POST /api/subscribe
 * Body → { plan: 'pro' | 'free' }
 * Creates only a SetupIntent for 'pro'; free returns quickly.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    const { plan } = req.body as { plan: 'pro' | 'free' };

    if (plan !== 'pro') {
      return res.json({ message: 'Free tier selected, no payment required.' });
    }

    // Ensure Firestore user document exists
    const userRef = db.collection('users').doc(uid);
    let userSnap = await userRef.get();
    if (!userSnap.exists) {
      const authUser = await admin.auth().getUser(uid);
      await userRef.set({ email: authUser.email!, isSubscribed: false });
      userSnap = await userRef.get();
    }
    const userData = userSnap.data()!;

    // Create or retrieve Stripe customer
    let customerId = userData.stripeCustomerId as string | undefined;
    if (!customerId) {
      const cust = await stripe.customers.create({ email: userData.email });
      customerId = cust.id;
      await userRef.update({ stripeCustomerId: customerId });
    }

    // Create a SetupIntent to collect the user's card
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

        // Create an ephemeral key for the mobile SDK (uses account default API version)
    const ephKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2025-06-30.basil' }
    );


    // Return details for client-side PaymentSheet in setup mode
    return res.json({
      customer: customerId,
      ephemeralKey: ephKey.secret,
      setupIntent: setupIntent.client_secret,
    });

  } catch (err: any) {
    console.error('[subscribe] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

export default router;
