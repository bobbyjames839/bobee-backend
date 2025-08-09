import { Router, Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

router.use(authenticate)

router.use((req: Request & { uid?: string }, res: Response, next: NextFunction) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

router.delete('/:journalId', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!
    const { journalId } = req.params

    const journalRef = db
      .collection('users').doc(uid)
      .collection('journals').doc(journalId)
    const statsRef = db
      .collection('users').doc(uid)
      .collection('metrics').doc('stats')
    const topicRef = db
      .collection('users').doc(uid)
      .collection('metrics').doc('topics')

    const journalSnap = await journalRef.get()
    if (!journalSnap.exists) {
      return res.status(404).json({ error: 'Journal not found' })
    }
    const journalData = journalSnap.data()!
    const topic = journalData.aiResponse?.topic

    if (topic) {
      await topicRef.update({
        [topic]: admin.firestore.FieldValue.increment(-1),
      })
    }

    const statsSnap = await statsRef.get()
    const statsData = statsSnap.exists ? statsSnap.data()! : {}
    const lastDate = statsData.lastJournalDate
      ? statsData.lastJournalDate.toDate().setHours(0,0,0,0)
      : null
    const selDate = journalData.createdAt
      .toDate().setHours(0,0,0,0)

    await journalRef.delete()

    if (lastDate === selDate) {
      const remSnap = await db
        .collection('users').doc(uid)
        .collection('journals')
        .orderBy('createdAt', 'desc')
        .get()

      if (remSnap.empty) {
        await statsRef.update({
          lastJournalDate: admin.firestore.Timestamp.fromDate(new Date('2000-01-01')),
          currentStreak: 0,
        })
      } else {
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
