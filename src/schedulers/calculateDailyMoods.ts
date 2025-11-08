import cron from 'node-cron'
import admin from 'firebase-admin'
import { db } from '../firebaseAdmin'

/**
 * Helper to format date as YYYY-MM-DD
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calculate daily mood for a specific user and date
 */
async function calculateMoodForUserAndDate(userId: string, dateString: string, dayStart: Date, dayEnd: Date) {
  const journalsSnap = await db
    .collection('users')
    .doc(userId)
    .collection('journals')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(dayStart))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
    .get()

  if (journalsSnap.empty) return null

  let totalMood = 0
  let count = 0

  journalsSnap.docs.forEach(doc => {
    const moodScore = doc.data().aiResponse?.moodScore
    if (typeof moodScore === 'number') {
      totalMood += moodScore
      count++
    }
  })

  if (count === 0) return null

  const averageMood = Math.round(totalMood / count)

  await db
    .collection('users')
    .doc(userId)
    .collection('dailyMoods')
    .doc(dateString)
    .set({
      date: dateString,
      averageMood,
      journalCount: count,
      calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

  return averageMood
}


export function scheduleDailyMoodCalculation() {
  cron.schedule('18 21 * * *', async () => {
    console.log('[calculateDailyMoods] Scheduled run started...')
  }, { timezone: 'UTC' })
}


