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

/**
 * Scheduled function that runs daily at 08:58 (UTC)
 */
export function scheduleDailyMoodCalculation() {
  cron.schedule('58 8 * * *', async () => {
    console.log('[calculateDailyMoods] Scheduled run started...')
    await runDailyMoodCalculationForAllUsers()
  }, { timezone: 'UTC' })
}

/**
 * On-demand helper to run for ALL users for yesterday
 */
export async function runDailyMoodCalculationForAllUsers() {
  console.log('[calculateDailyMoods] Manual run started...')

  try {
    // Yesterday’s date range
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    const yesterdayEnd = new Date(yesterday)
    yesterdayEnd.setHours(23, 59, 59, 999)

    const dayString = formatDateString(yesterday)
    console.log(`[calculateDailyMoods] Processing date: ${dayString}`)

    // All users
    const usersSnap = await db.collection('users').get()
    let processedUsers = 0
    let totalMoodsCalculated = 0

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id
      try {
        const result = await calculateMoodForUserAndDate(userId, dayString, yesterday, yesterdayEnd)
        if (result !== null) {
          processedUsers++
          totalMoodsCalculated++
        }
      } catch (error) {
        console.error(`[calculateDailyMoods] Error processing user ${userId}:`, error)
      }
    }

    console.log(`[calculateDailyMoods] Completed! Processed ${processedUsers} users, calculated ${totalMoodsCalculated} daily moods.`)
  } catch (error) {
    console.error('[calculateDailyMoods] Fatal error during manual run:', error)
  }
}
