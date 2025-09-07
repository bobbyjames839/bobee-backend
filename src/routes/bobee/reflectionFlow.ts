import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'
import { getBobeeAnswer, ChatMessage } from './getAIResponse'

const router = Router()
const db = admin.firestore()

interface ReflectionFlowBody {
  reflectionQuestion: string
  selectedOption: string
  userReply?: string
  firstAiAnswer?: string // optional echo from client if desired, not required server side
}

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { reflectionQuestion, selectedOption, userReply } = req.body as ReflectionFlowBody
    const uid = (req as AuthenticatedRequest).uid

    if (!reflectionQuestion || !selectedOption) {
      return res.status(400).json({ error: 'Missing reflectionQuestion or selectedOption' })
    }

    // Fetch latest 3 journals (transcript + optional aiResponse.summary)
    let latestJournals: any[] = []
    try {
      const snap = await db.collection('users').doc(uid).collection('journals')
        .orderBy('createdAt', 'desc').limit(3).get()
      latestJournals = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          transcript: (data.transcript || '').toString().slice(0, 800),
          summary: data.aiResponse?.summary || '',
          createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : null
        }
      })
    } catch (e) {
      console.warn('Failed loading journals for reflection context', e)
    }

    // Build conversation messages
    const baseContext: ChatMessage[] = []
    const journalsText = latestJournals.map(j => `• ${j.transcript}\nSummary: ${j.summary}`.trim()).join('\n\n')
    baseContext.push({
      role: 'system',
      content: `Recent Journals (internal context, do not list verbatim, just integrate subtly if helpful):\n${journalsText || 'None'}`
    })

    if (!userReply) {
      // Phase 1: after selection
      const userPrompt = `The user is beginning a daily reflection. Reflection Question: "${reflectionQuestion}". They chose the option: "${selectedOption}". Acknowledge their choice very briefly and ask ONE thoughtful, gentle deepening question inviting a bit more detail or feeling, making sure the question is fully answered. Keep it less than 60 words. End with the single question.`
      const { answer } = await getBobeeAnswer(uid, userPrompt, undefined, baseContext)
      return res.json({ answer, phase: 'ai_followup' })
    } else {
      // Phase 2: user replied; provide closing reflection (no more questions)
      const userPrompt = `Daily reflection second turn. Original question: "${reflectionQuestion}". Option chosen: "${selectedOption}". User replied to your earlier follow-up with: "${userReply}". Provide a concise closing reflection (120-220 words) that: 1) Validates their perspective, 2) Highlights one underlying need or value, 3) Offers 1-2 gentle next-step micro suggestions, 4) Ends with an encouraging closing sentence. Do NOT ask another question and do not make this sound overly nice, you should be trying to help the user but do not use overly warming language.`
      const pastMessages: ChatMessage[] = [
        { role: 'user', content: `User selected option: ${selectedOption}` },
      ]
      const { answer } = await getBobeeAnswer(uid, userPrompt, undefined, baseContext.concat(pastMessages))
      return res.json({ answer, done: true })
    }
  } catch (err) {
    console.error('reflectionFlow error', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router
