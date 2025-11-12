import { Request, Response, NextFunction } from 'express';
import { authAdmin, db } from '../utils/firebaseAdmin';

export interface AuthenticatedRequest extends Request {
  uid: string;
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.header('Authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const idToken = match[1];

  try {
    const decoded = await authAdmin.verifyIdToken(idToken);
    (req as AuthenticatedRequest).uid = decoded.uid;
    next();
  } catch (e) {
    console.error('Auth error', e);
    res.status(401).json({ error: 'Invalid ID token' });
  }
}
