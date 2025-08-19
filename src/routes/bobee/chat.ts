import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'
import { getBobeeAnswer, ChatMessage } from './getAIResponse'

export interface HistoryItem {
  question: string
  answer?: string
  reasoning?: string
  followup?: string
}

interface ChatRequest {
  conversationId?: string
  question: string
  history: HistoryItem[]
  userFacts?: string[]
}

const router = Router()
const db = admin.firestore()

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, question, history, userFacts } = req.body as ChatRequest
    const uid = (req as AuthenticatedRequest).uid

    // Check word limit
    const wordCount = [...history, { question, answer: '' }]
      .flatMap(i => [i.question, i.answer || '', i.followup || ''])
      .join(' ')
      .split(/\s+/).length
    if (wordCount > 1000) {
      return res.status(400).json({ error: 'Chat limit reached' })
    }

    // Prepare metrics if provided
    const metrics = userFacts?.reduce<Record<string, string>>((acc, fact, i) => {
      acc[`fact${i + 1}`] = fact
      return acc
    }, {})

    // Format past messages for AI
    const pastMessages: ChatMessage[] = history.flatMap(item => {
      const msgs: ChatMessage[] = [{ role: 'user', content: item.question }]
      if (item.answer) msgs.push({ role: 'assistant', content: item.answer })
      if (item.followup) msgs.push({ role: 'assistant', content: item.followup })
      return msgs
    })

    // Get AI response
    const { answer, reasoning, followup } = await getBobeeAnswer(
      uid,
      question,
      metrics,
      pastMessages
    )

    // Firestore refs
    const convs = db.collection('users').doc(uid).collection('conversations')
    let newId = conversationId

    // Create payload
    const idx = history.length * 2 + 1
    const payload: FirebaseFirestore.DocumentData = {
      [`message${idx}`]: question,
      [`message${idx + 1}`]: { answer, ...(reasoning && { reasoning }), ...(followup && { followup }) },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    // Check if new conversation
    const isNewConversation = !conversationId
    console.log('isNewConversation:', isNewConversation)
    if (isNewConversation) {
      const ref = await convs.add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        ...payload,
      })
      newId = ref.id

      // Increment daily usage only for new conversations
      const userRef = db.collection('users').doc(uid)
      const todayStr = new Date().toLocaleDateString('en-CA')
      const snap = await userRef.get()
      let newCount = 1
      if (snap.exists) {
        const data = snap.data()!
        const cu = data.conversationUsage || {}
        newCount = cu.date === todayStr ? (cu.count || 0) + 1 : 1
      }
      await userRef.set({
        conversationUsage: { date: todayStr, count: newCount }
      }, { merge: true })
    } else {
      await convs.doc(conversationId).update(payload)
    }

    res.json({ answer, reasoning, followup, conversationId: newId })
  } catch (err) {
    console.error('Chat error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
