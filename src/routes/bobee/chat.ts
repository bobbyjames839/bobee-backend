// backend/src/routes/chat.ts
import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'
import { getBobeeAnswer, ChatMessage } from './getResponse'

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

// POST /chat — handles metrics, AI call, and persisting the Q&A
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, question, history, userFacts } =
      req.body as ChatRequest
    const uid = (req as AuthenticatedRequest).uid

    // ——— Enforce chat‑length limit ———
    const projected = [...history, { question, answer: '' }]
    const wordCount = projected
      .flatMap(i => [i.question, i.answer || '', i.followup || ''])
      .join(' ')
      .split(/\s+/).length
    if (wordCount > 1000) {
      return res.status(400).json({ error: 'Chat limit reached' })
    }

    // ——— Bump conversationUsage counter ———
    const statsRef = db
      .collection('users')
      .doc(uid)
      .collection('metrics')
      .doc('stats')
    const statsSnap = await statsRef.get()

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toLocaleDateString('en-CA')

    if (statsSnap.exists) {
      const data = statsSnap.data()!
      const cu = data.conversationUsage || {}
      const newCount = cu.date === todayStr ? (cu.count || 0) + 1 : 1
      await statsRef.update({
        'conversationUsage.date': todayStr,
        'conversationUsage.count': newCount,
      })
    } else {
      await statsRef.set({
        totalWords: 0,
        totalEntries: 0,
        currentStreak: 0,
        lastJournalDate: admin.firestore.FieldValue.serverTimestamp(),
        conversationUsage: { date: todayStr, count: 1 },
      })
    }

    // ——— Prepare AI call ———
    const metrics = userFacts
      ? userFacts.reduce<Record<string, string>>((acc, fact, i) => {
          acc[`fact${i + 1}`] = fact
          return acc
        }, {})
      : undefined

    // annotate as ChatMessage[] so TS knows role is valid
    const pastMessages: ChatMessage[] = history.flatMap(item => {
      const msgs: ChatMessage[] = [{ role: 'user', content: item.question }]
      if (item.answer)   msgs.push({ role: 'assistant', content: item.answer })
      if (item.followup) msgs.push({ role: 'assistant', content: item.followup })
      return msgs
    })

    const { answer, reasoning, followup } = await getBobeeAnswer(
      uid,
      question,
      metrics,
      pastMessages
    )

    // ——— Persist to Firestore ———
    const convs = db.collection('users').doc(uid).collection('conversations')
    const payload: FirebaseFirestore.DocumentData = {}
    const idx = history.length * 2 + 1
    payload[`message${idx}`]     = question
    payload[`message${idx + 1}`] = {
      answer,
      ...(reasoning  && { reasoning }),
      ...(followup   && { followup }),
    }
    payload.updatedAt = admin.firestore.FieldValue.serverTimestamp()

    let newId = conversationId
    if (conversationId) {
      await convs.doc(conversationId).update(payload)
    } else {
      const ref = await convs.add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        ...payload,
      })
      newId = ref.id
    }

    res.json({ answer, reasoning, followup, conversationId: newId })
  } catch (err) {
    console.error('Chat error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router

//hey
