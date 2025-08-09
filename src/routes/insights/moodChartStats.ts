import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate } from '../../middleware/authenticate'

type RangeKey = '7d' | '28d'
interface MoodSeries { labels: string[]; values: Array<number | null> }
type SeriesResponse = Record<RangeKey, MoodSeries>

const router = Router()
const db = admin.firestore()

router.use(authenticate)

router.use((req: Request & { uid?: string }, res: Response, next) => {
  if (!req.uid) {
    return res.status(401).json({ error: 'Unauthorized – missing UID' })
  }
  next()
})

router.get('/', async (req: Request & { uid?: string }, res: Response) => {
  try {
    const uid = req.uid!
    const now = new Date()
    const out: SeriesResponse = {
      '7d': { labels: [], values: [] },
      '28d': { labels: [], values: [] },
    }

    for (const key of ['7d','28d'] as RangeKey[]) {
      const days = key === '7d' ? 7 : 28
      const start = new Date(now)
      start.setDate(now.getDate() - days)

      const snap = await db
        .collection('users').doc(uid)
        .collection('journals')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(start))
        .get()

      const byDay: Record<string, number[]> = {}
      snap.docs.forEach(doc => {
        const data = doc.data()
        const score = data.aiResponse?.moodScore as number|undefined
        const ts = data.createdAt?.toDate?.()
        if (score != null && ts) {
          const day = ts.toISOString().slice(0,10)
          ;(byDay[day] ||= []).push(score)
        }
      })

      const labels: string[] = []
      const values: (number|null)[] = []
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        const iso = d.toISOString().slice(0,10)
        labels.push(`${d.getDate()}/${d.getMonth()+1}`)
        const arr = byDay[iso] || []
        values.push(
          arr.length
            ? parseFloat((arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1))
            : null
        )
      }

      out[key] = {
        labels: key === '28d'
          ? labels.map((l, idx) => idx % 4 === 0 ? l : '')
          : labels,
        values,
      }
    }

    res.json(out)
  } catch (err) {
    console.error('Error fetching moodChartStats:', err)
    res.status(500).json({ error: 'Failed to read moodChartStats' })
  }
})

export default router
