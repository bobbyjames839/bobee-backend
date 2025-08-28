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

    const entitlement = data.entitlement || null;
    let appleActive = false;
    let appleExpiresAt: number | null = null;
    if (entitlement && typeof entitlement.expiresAt === 'number') {
      appleExpiresAt = entitlement.expiresAt;
      appleActive = entitlement.expiresAt > Date.now();
    }

  const isSubscribed = appleActive;
  const source: 'apple' | null = appleActive ? 'apple' : null;

    res.set('Cache-Control', 'no-store');
    return res.json({
      isSubscribed,
      source,
      apple: entitlement ? {
        productId: entitlement.productId,
        expiresAt: appleExpiresAt,
        isActive: appleActive,
        environment: entitlement.environment || 'unknown',
      } : null,
  legacy: null,
    });
  } catch (err: any) {
    console.error('[unified-status] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});

export default router;
