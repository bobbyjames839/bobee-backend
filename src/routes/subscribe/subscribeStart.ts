/* ========== Backend: src/routes/subscribeStart.ts ========== */
import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import Stripe from 'stripe';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();
const db = admin.firestore();

// Keep basil because we rely on flexible billing + confirmation_secret
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

type InvoiceWithConfirm = Stripe.Invoice & {
  confirmation_secret?: { client_secret?: string | null } | null;
};

/**
 * POST /api/subscribe/start
 * Creates an INCOMPLETE subscription and returns a client_secret
 * (from invoice.confirmation_secret) for Stripe PaymentSheet.
 * Requires env:
 *  - STRIPE_SECRET_KEY
 *  - STRIPE_PRO_PRICE_ID
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    if (!uid) return res.status(401).json({ error: 'Unauthorized – missing UID' });

    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) return res.status(500).json({ error: 'Server missing STRIPE_PRO_PRICE_ID' });

    // Load user -> must have stripeCustomerId
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });

    const customerId = snap.data()!.stripeCustomerId as string | undefined;
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer on file' });

    // Create subscription; expand invoice + its confirmation_secret
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      billing_mode: { type: 'flexible' },
      collection_method: 'charge_automatically',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice', 'latest_invoice.confirmation_secret'],
    });

    // latest_invoice can be string | Invoice | null — narrow it
    const li = subscription.latest_invoice as string | InvoiceWithConfirm | null;

    let clientSecret: string | null = null;
    if (li && typeof li !== 'string') {
      clientSecret = li.confirmation_secret?.client_secret ?? null;
    }

    // Work out invoice ID regardless of shape
    let invoiceId: string | null = null;
    if (typeof li === 'string') {
      invoiceId = li;
    } else if (li && typeof li !== 'string') {
      invoiceId = li.id ?? null;
    }

    // Fallback: explicitly retrieve invoice with confirmation_secret expanded
    if (!clientSecret && invoiceId) {
      const retrieved = (await stripe.invoices.retrieve(invoiceId, {
        expand: ['confirmation_secret'],
      })) as InvoiceWithConfirm;
      clientSecret = retrieved.confirmation_secret?.client_secret ?? null;
    }

    if (!clientSecret) {
      return res.status(500).json({
        error: 'Failed to get invoice confirmation client_secret',
        debug: {
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          invoiceId,
        },
      });
    }

    // OPTIONAL: ephemeral key so the RN PaymentSheet can show saved methods, etc.
    // Comment these lines out if you don’t need customer mode in the sheet.
    const ephKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2025-06-30.basil' }
    );

    return res.json({
      subscriptionId: subscription.id,
      clientSecret,                  // pass to PaymentSheet as paymentIntentClientSecret
      customerId,                    // optional, but useful for customer mode
      ephemeralKeySecret: ephKey.secret, // optional
    });
  } catch (err: any) {
    console.error('[subscribe/start] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

export default router;
