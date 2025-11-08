import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

router.use(authenticate)

router.use((req: Request & { uid?: string }, res: Response, next) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})


async function getMostRecentJournalTimestamp(uid: string): Promise<FirebaseFirestore.Timestamp | null> {
  // Try user subcollection
  let latestSnap = await db
    .collection('users').doc(uid)
    .collection('journals')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  if (!latestSnap.empty) {
    const ts = latestSnap.docs[0].get('createdAt')
    if (ts && typeof ts.toDate === 'function') return ts as FirebaseFirestore.Timestamp
  }

  // Fallback: top-level
  latestSnap = await db
    .collection('journals')
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  if (!latestSnap.empty) {
    const ts = latestSnap.docs[0].get('createdAt')
    if (ts && typeof ts.toDate === 'function') return ts as FirebaseFirestore.Timestamp
  }

  return null
}

router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!

    // 1) Read existing habit stats
    const userRef = db.collection('users').doc(uid)
    const snap = await userRef.get()
    const base = snap.exists ? snap.data()! : {}

    const totalWords = base.journalStats?.totalWords || 0
    const totalEntries = base.journalStats?.totalEntries || 0
    let currentStreak = base.journalStats?.streak || 0

    // 2) Determine if we need to reset the streak based on the most recent journal date
    const lastJournalTs = await getMostRecentJournalTimestamp(uid)
    const nowMs = Date.now()
    const cutoffMs = nowMs - 24 * 60 * 60 * 1000

    const shouldReset =
      !lastJournalTs || (lastJournalTs.toDate().getTime() < cutoffMs)

    if (shouldReset && currentStreak !== 0) {
      await userRef.set(
        {
          journalStats: {
            ...(base.journalStats || {}),
            streak: 0,
          },
          // Keep these fields updated for observability/debugging:
          lastStreakResetAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(lastJournalTs ? { lastJournalDate: lastJournalTs } : {}),
        },
        { merge: true }
      )
      currentStreak = 0
    } else {
      // Optionally keep lastJournalDate fresh even if no reset is needed
      if (lastJournalTs) {
        await userRef.set({ lastJournalDate: lastJournalTs }, { merge: true })
      }
    }

    // 3) Compute avg mood over the past 3 days (72 hours)
    const since = admin.firestore.Timestamp.fromDate(
      new Date(nowMs - 3 * 24 * 60 * 60 * 1000)
    )

    // Primary location: users/{uid}/journals
    let jSnap = await db
      .collection('users').doc(uid)
      .collection('journals')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .get()

    // Fallback: top-level 'journals' with userId
    if (jSnap.empty) {
      jSnap = await db
        .collection('journals')
        .where('userId', '==', uid)
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'desc')
        .get()
    }

    let sum = 0
    let count = 0
    jSnap.forEach(doc => {
      const val = doc.get('aiResponse.moodScore')
      if (typeof val === 'number') {
        sum += val
        count += 1
      }
    })
    const avgMoodLast3Days = count > 0 ? Number((sum / count).toFixed(2)) : null

    // 4) Build hourly histogram in Europe/London
    const allJournalsSnap = await db
      .collection('users').doc(uid)
      .collection('journals')
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()

    const hours: number[] = new Array(24).fill(0)
    const londonHourFormatter = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Europe/London',
    })
    allJournalsSnap.forEach(doc => {
      const ts = doc.get('createdAt')
      if (ts && typeof ts.toDate === 'function') {
        const d: Date = ts.toDate()
        let h = 0
        try {
          const parts = londonHourFormatter.formatToParts(d)
          const hourPart = parts.find(p => p.type === 'hour')
          if (hourPart) h = parseInt(hourPart.value, 10) || 0
        } catch {
          h = d.getUTCHours()
        }
        hours[h] += 1
      }
    })

    res.json({
      totalWords,
      totalEntries,
      currentStreak,        // this is the adjusted streak (possibly reset to 0)
      avgMoodLast3Days,
      hourlyHistogram: hours,
      lastJournalDate: lastJournalTs ? lastJournalTs.toDate().toISOString() : null,
      streakEvaluatedAt: new Date(nowMs).toISOString(),
    })
  } catch (err) {
    console.error('Error fetching HabitCards stats:', err)
    res.status(500).json({ error: 'Failed to read HabitCards stats' })
  }
})

export default router
