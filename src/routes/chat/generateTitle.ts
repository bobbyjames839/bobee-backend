import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import fetch from 'cross-fetch'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

interface GenerateTitleRequest {
  conversationId: string
  question: string
  answer: string
}

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, question, answer } = req.body as GenerateTitleRequest
    const uid = (req as AuthenticatedRequest).uid

    if (!conversationId || !question || !answer) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const title = await generateTitle(question, answer)
    
    // Save to conversationTitles subcollection
    await db
      .collection('users')
      .doc(uid)
      .collection('conversationTitles')
      .doc(conversationId)
      .set({
        title,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

    console.log(`Title saved for conversation ${conversationId}: "${title}"`)
    
    // Return title to frontend
    res.json({ title, conversationId })
  } catch (error) {
    console.error('Error generating/saving conversation title:', error)
    res.status(500).json({ error: 'Failed to generate title' })
  }
})

/**
 * Generates a title for a conversation based on the first Q&A exchange
 */
async function generateTitle(
  firstQuestion: string,
  firstAnswer: string
): Promise<string> {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
      console.warn('Missing OPENAI_API_KEY, cannot generate title')
      return 'Untitled'
    }

    // Generate title using OpenAI
    const prompt = `Based on this conversation exchange, generate a short, concise title (max 6 words) that captures the main topic or question:

Question: ${firstQuestion}
Answer: ${firstAnswer}

Title:`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise, descriptive titles for conversations. Respond with only the title, no quotes or extra text.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 20,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const completion = await response.json()

    const generatedTitle = completion.choices[0]?.message?.content?.trim() || 'Untitled'
    
    // Remove quotes if present
    const title = generatedTitle.replace(/^["']|["']$/g, '')

    return title
  } catch (error) {
    console.error('Error generating conversation title:', error)
    return 'Untitled'
  }
}

export default router
