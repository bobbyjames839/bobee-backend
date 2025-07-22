import { Router, Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

// 1) verify token & populate req.uid
router.use(authenticate)

// 2) guard
router.use((req: Request & { uid?: string }, res: Response, next: NextFunction) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

/**
 * DELETE /:journalId
 * - Deletes the journal doc
 * - Decrements topic count
 * - Updates lastJournalDate & currentStreak if needed
 */
router.delete('/:journalId', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!
    const { journalId } = req.params

    // refs
    const journalRef = db
      .collection('users').doc(uid)
      .collection('journals').doc(journalId)
    const statsRef = db
      .collection('users').doc(uid)
      .collection('metrics').doc('stats')
    const topicRef = db
      .collection('users').doc(uid)
      .collection('metrics').doc('topics')

    // 1. fetch the journal
    const journalSnap = await journalRef.get()
    if (!journalSnap.exists) {
      return res.status(404).json({ error: 'Journal not found' })
    }
    const journalData = journalSnap.data()!
    const topic = journalData.aiResponse?.topic

    // 2. decrement topic count
    if (topic) {
      await topicRef.update({
        [topic]: admin.firestore.FieldValue.increment(-1),
      })
    }

    // 3. check if it was the last-day entry
    const statsSnap = await statsRef.get()
    const statsData = statsSnap.exists ? statsSnap.data()! : {}
    const lastDate = statsData.lastJournalDate
      ? statsData.lastJournalDate.toDate().setHours(0,0,0,0)
      : null
    const selDate = journalData.createdAt
      .toDate().setHours(0,0,0,0)

    // 4. delete the journal
    await journalRef.delete()

    // 5. update stats if needed
    if (lastDate === selDate) {
      const remSnap = await db
        .collection('users').doc(uid)
        .collection('journals')
        .orderBy('createdAt', 'desc')
        .get()

      if (remSnap.empty) {
        // no more entries
        await statsRef.update({
          lastJournalDate: admin.firestore.Timestamp.fromDate(new Date('2000-01-01')),
          currentStreak: 0,
        })
      } else {
        // set to the next-most recent
        const nextDate = remSnap.docs[0].data().createdAt.toDate()
        await statsRef.update({
          lastJournalDate: admin.firestore.Timestamp.fromDate(nextDate),
        })
      }
    }

    return res.status(204).send()
  } catch (err) {
    console.error('Error in deleteJournal:', err)
    return res.status(500).json({ error: 'Failed to delete journal' })
  }
})

export default router
