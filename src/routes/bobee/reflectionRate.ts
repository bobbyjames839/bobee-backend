import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'
import { getBobeeAnswer } from '../chat/getAIResponse'

const router = Router()
const db = admin.firestore()

interface RateBody {
  reflectionQuestion: string
  selectedOption: string
  userReply: string
  aiFollowup: string
  aiFinal: string
}

router.post('/', authenticate, async (req: Request, res: Response) => {
  console.log('this function is running')
  try {
    const { uid } = req as AuthenticatedRequest
    const { reflectionQuestion, selectedOption, userReply, aiFollowup, aiFinal } = req.body as RateBody

    if (!reflectionQuestion || !selectedOption || !userReply || !aiFollowup || !aiFinal) {
      return res.status(400).json({ error: 'missing-fields' })
    }

    const today = new Date().toISOString().split('T')[0]

    const prompt = `You are evaluating a SHORT two-turn self-reflection.
        Reflection question: "${reflectionQuestion}"
        Initial user option: "${selectedOption}"
        AI follow-up: "${aiFollowup}"
        User reply: "${userReply}"
        AI closing: "${aiFinal}"
        Provide a JSON object ONLY like: {"score": number (1-5), "label": string}
        Scoring rubric: 1 = avoidant/minimal, 2 = brief surface, 3 = some emotional/insight effort, 4 = good depth + actionable intent, 5 = strong self-awareness + constructive next steps. Use whole numbers only. Label is 2-4 words summarizing user's engagement quality. No extra text.`

    const { answer } = await getBobeeAnswer(uid, prompt)

    let parsed: any = {}
    try { parsed = JSON.parse(answer) } catch { parsed = {} }

    const score =
      typeof parsed.score === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.score))) : 3
    const label =
      typeof parsed.label === 'string' ? parsed.label.slice(0, 40) : 'Engaged'

    const userRef = db.collection('users').doc(uid)
    const ratingsColRef = userRef.collection('reflectionRatings')
    const todayDocRef = ratingsColRef.doc(today)

    // Ensure the user doc exists and reflectionCompleted is set
    await userRef.set({ reflectionCompleted: true }, { merge: true })

    // Write today's rating in a subcollection doc
    await todayDocRef.set(
      {
        score,
        label,
        // optional: keep context of what was rated
        reflectionQuestion,
        selectedOption,
        userReply,
        aiFollowup,
        aiFinal,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    )

    return res.json({ score, label })
  } catch (e) {
    console.error('reflectionRate error', e)
    return res.status(500).json({ error: 'server-error' })
  }
})

export default router
