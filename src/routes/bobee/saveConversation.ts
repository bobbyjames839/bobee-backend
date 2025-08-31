import { Router, Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'
import fetch from 'cross-fetch'

const router = Router()
const db = admin.firestore()

interface HistoryItem {
  question: string
  answer?: string
}

interface SaveConversationBody {
  conversationId?: string
  transcript: string
  history: HistoryItem[]
}

const getConversationTitle = async (
  userId: string,
  conversationText: string
): Promise<string> => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!conversationText || !conversationText.trim()) {
    throw new Error('Conversation text is required for titling')
  }

  const systemPrompt = `
  You are Bobee’s Title Generator.  
  Your only task is to read a user–AI chat transcript and produce a very short (max 6 words) descriptive title.  
  Respond with exactly and only:
    { "title": "..." }
  `.trim()

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: conversationText.trim() },
  ]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      temperature: 0.7,
      messages,
    }),
  })

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Empty response from OpenAI')
  }

  let parsed: { title: string }
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    console.error('Failed to parse title JSON:', err, '\nAI response:', content)
    throw new Error('Malformed JSON in title response')
  }

  if (!parsed.title || typeof parsed.title !== 'string') {
    throw new Error('AI did not return a valid title')
  }

  return parsed.title.trim()
}

async function verifyToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' })
  }

  const idToken = authHeader.split('Bearer ')[1]
  try {
    const decoded = await admin.auth().verifyIdToken(idToken)
    ;(req as any).uid = decoded.uid
    next()
  } catch (err) {
    console.error('Token verification failed', err)
    res.status(401).json({ message: 'Unauthorized' })
  }
}

router.post(
  '/',
  verifyToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const uid = (req as any).uid as string
      const { conversationId, transcript, history } = req.body as SaveConversationBody

      const title = await getConversationTitle(uid, transcript)

      const payload: FirebaseFirestore.DocumentData = {
        title,
        transcript,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }

      history.forEach((item, idx) => {
        const qKey = `message${idx * 2 + 1}`
        const aKey = `message${idx * 2 + 2}`
        payload[qKey] = item.question
  payload[aKey] = { answer: item.answer ?? '' }
      })

      const convs = db
        .collection('users')
        .doc(uid)
        .collection('conversations')

      let docRef: FirebaseFirestore.DocumentReference
      if (conversationId) {
        docRef = convs.doc(conversationId)
        await docRef.update(payload)
      } else {
        docRef = await convs.add({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          ...payload,
        })
      }

      res.json({ conversationId: docRef.id })
    } catch (err) {
      console.error('Error saving conversation:', err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

export default router
