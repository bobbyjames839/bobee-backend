import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import fetch from 'node-fetch'
import { authenticate, AuthenticatedRequest } from '../../middleware/authenticate'

const router = Router()
const db = admin.firestore()

// POST ONLY: Generate & return personal spoken-style message and update lastBobeeMessage.
// (GET moved to /api/bobee-message-meta to avoid prefetching this route.)
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const uid = (req as AuthenticatedRequest).uid
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'missing-openai-key' })

  const since = Date.now() - 72 * 60 * 60 * 1000

  // Fetch user profile data (facts & summary) for personalization
  const userRef = db.collection('users').doc(uid)
  const userSnap = await userRef.get()
  const userData = userSnap.data() || {}
  const facts: string[] = Array.isArray(userData.facts) ? userData.facts.filter((f: any) => typeof f === 'string' && f.trim()).slice(0, 30) : []
  const profileSummaryRaw = (userData.profileSummary || userData.summary || userData.profile || userData.description || '').toString().trim()
  const displayName = (userData.firstName || userData.name || userData.displayName || '').toString().trim()
  const firstName = displayName.split(/\s+/)[0] || ''
    const journalsSnap = await db
      .collection('users')
      .doc(uid)
      .collection('journals')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(since))
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()

    type J = { transcript?: string; aiResponse?: any; createdAt?: any }
    const entries: { createdAt: number; transcript: string; summary?: string }[] = []
    journalsSnap.forEach(doc => {
      const data = doc.data() as J
      let createdAtMs = Date.now()
      const ca = data.createdAt
      if (ca && typeof ca.toMillis === 'function') createdAtMs = ca.toMillis()
      const transcript = (data.transcript || '').toString().trim()
      if (!transcript) return
      const summary = data.aiResponse?.summary && typeof data.aiResponse.summary === 'string' ? data.aiResponse.summary : undefined
      entries.push({ createdAt: createdAtMs, transcript, summary })
    })

    let combined = entries
      .map(e => {
        const dateStr = new Date(e.createdAt).toISOString().split('T')[0]
        return `Date: ${dateStr}\nEntry: ${e.transcript}${e.summary ? `\nAI Summary: ${e.summary}` : ''}`
      })
      .join('\n\n')

    const NO_JOURNALS = entries.length === 0
    if (!combined) combined = 'No recent journal content.'
    const MAX_CHARS = 6000
    if (combined.length > MAX_CHARS) combined = combined.slice(0, MAX_CHARS) + '\n... (truncated)'

    const systemPrompt = [
      'ROLE: You are a compassionate, steady, friendly journaling companion generating a SHORT SPOKEN reflection for the user.',
      'OBJECTIVE: Empathetic reflective mini speech (~130–165 words) from provided material + stable user background facts.',
      'SOURCE: Only supplied journal excerpts and provided user background; no invention, diagnosis, speculation, or assumptions beyond them.',
      'PERSONALIZATION: Address the user by first name once near the beginning' + (firstName ? ` (name: ${firstName}).` : '.'),
      'TONE: Warm, grounded, like a close friend who notices patterns and gently encourages. Not clinical, not preachy, not cheerleader hype.',
      'STYLE: Varied sentence lengths (8–18 words). No bullet lists, no quotes from the journals, no questions, no therapy disclaimers, no apologies, no instructions about journaling, no semicolons.',
      'LANGUAGE: Mix direct second-person with occasional neutral observation wording; spell out numbers one to ten.',
      'CONTENT: Surface themes, strengths, steady efforts; normalize setbacks; include one or two gentle forward-looking encouragement lines (not directives, not imperative "You should").',
      'SPARSE: If little/no recent content, mention that briefly and give light encouragement (≤55 words).',
      'OUTPUT: ONLY the speech text. 1–4 short paragraphs. ≤165 words.'
    ].join('\n')

    // Additional background info section to aid model
    const backgroundBlockParts: string[] = []
    if (firstName) backgroundBlockParts.push(`firstName: ${firstName}`)
    if (profileSummaryRaw) backgroundBlockParts.push(`profileSummary: ${profileSummaryRaw}`)
    if (facts.length) backgroundBlockParts.push(`facts: ${facts.join(' | ')}`)
    const backgroundBlock = backgroundBlockParts.length
      ? 'ADDITIONAL_USER_CONTEXT (derived from longer-term journal analysis; do not restate mechanically):\n' + backgroundBlockParts.join('\n')
      : 'ADDITIONAL_USER_CONTEXT: none'

    const userPrompt = JSON.stringify({ recentJournals: combined, background: backgroundBlock })

  let speech = 'Not enough recent journaling to generate a personalised reflection yet. Add an entry and try again soon.'
  let audioB64: string | null = null
  let audioFormat = 'mp3'
    if (!NO_JOURNALS) {
      try {
        const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            temperature: 0.65,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          })
        })
        if (aiResp.ok) {
          const aiData = await aiResp.json()
          const raw = (aiData.choices?.[0]?.message?.content || '').trim()
          if (raw) speech = raw.slice(0, 1400)
        } else {
          console.error('lastBobeeMessage POST generation error status', aiResp.status)
        }
      } catch (err) {
        console.error('lastBobeeMessage POST openai exception', err)
      }
    }

    // Attempt to generate TTS audio via OpenAI (optional, non-fatal)
    // Allow opt-out if env not configured. Provide model & voice via env for flexibility.
    const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
    const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy'
    const ENABLE_TTS = process.env.ENABLE_BOBEE_TTS !== 'false'
    if (speech && ENABLE_TTS) {
      try {
        // Use OpenAI TTS endpoint (audio/speech). If this fails we silently continue without audio.
        const ttsResp = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: TTS_MODEL,
              voice: TTS_VOICE,
              input: speech,
              format: audioFormat
            })
        })
        if (ttsResp.ok) {
          const arrayBuf = await ttsResp.arrayBuffer()
          const buf = Buffer.from(arrayBuf)
          audioB64 = buf.toString('base64')
        } else {
          console.error('OpenAI TTS failed status', ttsResp.status)
        }
      } catch (e) {
        console.error('OpenAI TTS exception', e)
      }
    }

  await userRef.set({ lastBobeeMessage: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
    const snap = await userRef.get()
    const data = snap.data() || {}
    const lbm = data.lastBobeeMessage
    let epoch: number | null = null
    if (lbm && typeof lbm.toMillis === 'function') epoch = lbm.toMillis()
    else if (typeof lbm === 'number') epoch = lbm

  return res.json({ speech, lastBobeeMessage: epoch, noRecentJournals: NO_JOURNALS, audio: audioB64 ? { format: audioFormat, b64: audioB64 } : null })
  } catch (e) {
    console.error('lastBobeeMessage POST error', e)
    return res.status(500).json({ error: 'internal' })
  }
})

export default router
