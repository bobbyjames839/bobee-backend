import cron from 'node-cron'
import admin from 'firebase-admin'
import { db } from '../utils/firebaseAdmin'

// Helper: format date as YYYY-MM-DD
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Calculate average mood for a user for a specific date
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

// Schedule to calculate *yesterday's* daily mood
export function scheduleDailyMoodCalculation() {
  cron.schedule(
    '05 0 * * *', // every day at 21:23 London time
    async () => {
      console.log('[calculateDailyMoods] Scheduled run started...')

      // Get yesterday's date
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const dateString = formatDateString(yesterday)

      // Define start and end of yesterday (UTC times)
      const dayStart = new Date(yesterday)
      dayStart.setUTCHours(0, 0, 0, 0)
      const dayEnd = new Date(yesterday)
      dayEnd.setUTCHours(23, 59, 59, 999)

      // Fetch all users
      const usersSnap = await db.collection('users').get()
      if (usersSnap.empty) {
        console.log('[calculateDailyMoods] No users found, skipping.')
        return
      }

      // Process each user
      for (const userDoc of usersSnap.docs) {
        try {
          const result = await calculateMoodForUserAndDate(userDoc.id, dateString, dayStart, dayEnd)
          if (result !== null) {
            console.log(`[calculateDailyMoods] Stored mood for user ${userDoc.id}: ${result}`)
          } else {
            console.log(`[calculateDailyMoods] No journals for user ${userDoc.id}.`)
          }
        } catch (err) {
          console.error(`[calculateDailyMoods] Error processing user ${userDoc.id}:`, err)
        }
      }

      console.log('[calculateDailyMoods] Finished calculating all users for', dateString)
    },
    { timezone: 'Europe/London' } // ensures it runs at 21:23 London time (handles BST/GMT)
  )
}
