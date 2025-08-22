import { Router, RequestHandler, Response } from 'express'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'
import { db } from '../../firebaseAdmin'

const router = Router()

const getUserProfile: RequestHandler = async (req, res: Response) => {
  try {
    const { uid } = req as AuthenticatedRequest

    // Get the user document directly to access the userProfile
    const userDoc = await db
      .collection('users')
      .doc(uid)
      .get()

    // If the document exists, extract the userProfile
    if (userDoc.exists) {
      const userData = userDoc.data()!;
      
      // Return only the userProfile
      res.json({ 
        userProfile: userData.userProfile || null
      });
    } else {
      res.json({ userProfile: null });
    }
  } catch (err) {
    console.error('Error loading user profile data:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

router.get('/', authenticate, getUserProfile)

export default router
