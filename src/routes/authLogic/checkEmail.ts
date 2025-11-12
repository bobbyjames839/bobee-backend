import { Request, Response } from 'express';
import { authAdmin } from '../../utils/firebaseAdmin';

export const checkEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists in Firebase Auth
    try {
      await authAdmin.getUserByEmail(email);
      // If we get here, the user exists
      return res.json({ exists: true });
    } catch (error: any) {
      // If error code is user-not-found, email doesn't exist
      if (error.code === 'auth/user-not-found') {
        return res.json({ exists: false });
      }
      // For other errors, log and return error
      console.error('Error checking email:', error);
      return res.status(500).json({ error: 'Error checking email' });
    }
  } catch (error) {
    console.error('Error in checkEmail:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
