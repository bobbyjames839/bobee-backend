import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate';

const router = Router();
const db = admin.firestore();

// GET /api/subscribe/unified-status
// Combines Stripe flag + Apple entitlement
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest;
    if (!uid) return res.status(401).json({ error: 'Unauthorized – missing UID' });

    const snap = await db.collection('users').doc(uid).get();
    const data = snap.exists ? snap.data() || {} : {};

    const stripeSubscribed = !!data.subscribe?.subscribed;
    const cancelDate = typeof data.subscribe?.cancelDate === 'number' ? data.subscribe.cancelDate : null;

    const entitlement = data.entitlement || null;
    let appleActive = false;
    let appleExpiresAt: number | null = null;
    if (entitlement && typeof entitlement.expiresAt === 'number') {
      appleExpiresAt = entitlement.expiresAt;
      appleActive = entitlement.expiresAt > Date.now();
    }

    let isSubscribed = false;
    let source: 'apple' | 'stripe' | null = null;
    if (appleActive) { isSubscribed = true; source = 'apple'; }
    else if (stripeSubscribed) { isSubscribed = true; source = 'stripe'; }

    res.set('Cache-Control', 'no-store');
    return res.json({
      isSubscribed,
      source,
      stripe: stripeSubscribed ? { subscribed: true, cancelDate } : null,
      apple: entitlement
        ? {
            productId: entitlement.productId,
            expiresAt: appleExpiresAt,
            isActive: appleActive,
            environment: entitlement.environment || 'unknown',
          }
        : null,
    });
  } catch (err: any) {
    console.error('[unified-status] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

export default router;
