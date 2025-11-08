import cron from 'node-cron'
import admin from 'firebase-admin'
import { db } from '../firebaseAdmin'

// Helper: format date as YYYY-MM-DD
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Calculate average mood for a user between given start and end
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

// Schedules the daily calculation
export function scheduleDailyMoodCalculation() {
  cron.schedule(
    '25 21 * * *', // Runs every day at 21:23 London time
    async () => {
      console.log('[calculateDailyMoods] Scheduled run started...')

      const now = new Date()
      const dateString = formatDateString(now)

      // Define start and end of the current day (in UTC for Firestore)
      const dayStart = new Date(now)
      dayStart.setUTCHours(0, 0, 0, 0)
      const dayEnd = new Date(now)
      dayEnd.setUTCHours(23, 59, 59, 999)

      const usersSnap = await db.collection('users').get()
      for (const userDoc of usersSnap.docs) {
        try {
          await calculateMoodForUserAndDate(userDoc.id, dateString, dayStart, dayEnd)
        } catch (err) {
          console.error(`Error processing user ${userDoc.id}:`, err)
        }
      }

      console.log('[calculateDailyMoods] Finished all users.')
    },
    { timezone: 'Europe/London' }
  )
}
