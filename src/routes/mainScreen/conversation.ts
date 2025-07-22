// functions/src/routes/conversation.ts
import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'

const router = Router()
const db = admin.firestore()

// DELETE  /conversations/:id
router.delete(
  '/:id',
  async (req: Request & { uid?: string }, res: Response) => {
    try {
      await db
        .collection('users')
        .doc(req.uid!)
        .collection('conversations')
        .doc(req.params.id)
        .delete()

      res.json({ success: true })
    } catch (e) {
      console.error('Error deleting conversation:', e)
      res.status(500).json({ error: 'Delete failed' })
    }
  }
)

export default router
