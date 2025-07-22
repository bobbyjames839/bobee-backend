// functions/src/routes/journals/fetchJournals.ts
import { Router, Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

// 1) Verify Firebase ID token & populate req.uid
router.use(authenticate)

// 2) Guard to be safe
router.use((req: Request & { uid?: string }, res: Response, next: NextFunction) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

/**
 * GET /
 * Returns all journal entries for the authenticated user,
 * ordered by createdAt desc:
 *   Array<{ id: string; [key: string]: any; createdAt: string }>
 */
router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!
    const journalsRef = db
      .collection('users')
      .doc(uid)
      .collection('journals')
      .orderBy('createdAt', 'desc')

    const snap = await journalsRef.get()
    const journals = snap.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        // convert Firestore Timestamp → ISO string
        createdAt: data.createdAt?.toDate().toISOString() ?? null,
      }
    })

    return res.json(journals)
  } catch (err) {
    console.error('Error fetching journals:', err)
    return res.status(500).json({ error: 'Failed to fetch journals' })
  }
})

export default router
