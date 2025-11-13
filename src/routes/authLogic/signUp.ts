import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { encrypt } from '../../utils/encryption'

const router = Router()
const auth = admin.auth()
const db = admin.firestore()

const MIN_PASSWORD_LENGTH = 8


router.post('/', async (req: Request, res: Response) => {
  try {
    const nameRaw = String(req.body?.name || '').trim()
    const emailRaw = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const gender = String(req.body?.gender || '').trim()

    if (!nameRaw) return res.status(400).json({ error: 'name required' })
    if (!emailRaw) return res.status(400).json({ error: 'email required' })
    if (!password) return res.status(400).json({ error: 'password required' })
    if (!gender) return res.status(400).json({ error: 'gender required' })
    if (!gender) return res.status(400).json({ error: 'gender required' })
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `weak-password` })
    }

    const userRecord = await auth.createUser({
      email: emailRaw,
      password,
      displayName: nameRaw,
      emailVerified: false,
      disabled: false,
    })

    const uid = userRecord.uid
    const batch = db.batch()
    const userInfoRef = db.collection('users').doc(uid)
    const today = new Date().toISOString().split('T')[0]

    // Initialize empty conversations and journals collections
    const conversationsRef = db.collection('users').doc(uid).collection('conversations').doc('init')
    const journalsRef = db.collection('users').doc(uid).collection('journals').doc('init')
    const userProfileFactsRef = db.collection('users').doc(uid).collection('userProfile').doc('facts')
    const userProfileStatusRef = db.collection('users').doc(uid).collection('userProfile').doc('status')

    batch.set(userInfoRef, {
        name: nameRaw,
        email: emailRaw,
        gender: gender,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastJournalDate: null,
        voiceUsage: { date: today, totalSeconds: 0 },
        conversationUsage: { date: today, count: 0 },
        journalStats: { streak: 0, totalEntries: 0, totalWords: 0 },
        personality: { clarity: 50, confidence: 50, discipline: 50, focus: 50, resilience: 50, selfWorth: 50 },
        personalityDeltas: { clarity: 0, confidence: 0, discipline: 0, focus: 0, resilience: 0, selfWorth: 0 },
        topics: {},
        lastBobeeMessage: admin.firestore.FieldValue.serverTimestamp(),
        reflectionCompleted: true
    })

    batch.set(conversationsRef, { initialized: true })
    batch.set(journalsRef, { initialized: true })
    batch.set(userProfileFactsRef, {
      facts: [
        {
          text: encrypt(`the user is called ${nameRaw}`),
          createdAt: admin.firestore.Timestamp.now(), // concrete timestamp; serverTimestamp sentinel not allowed inside arrays
        },
        {
          text: encrypt(`the user identifies as ${gender}`),
          createdAt: admin.firestore.Timestamp.now(),
        },
      ],
    })
    batch.set(userProfileStatusRef, {
      statusParagraph: encrypt('Getting started – we will reflect how you are doing here soon.')
    })

    await batch.commit()

    return res.status(201).json({ ok: true, uid })
  } catch (err: any) {
    const code = err?.code || ''
    if (code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'email-already-in-use' })
    }
    if (code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'invalid-email' })
    }
    if (code === 'auth/weak-password') {
      return res.status(400).json({ error: 'weak-password' })
    }
    console.error('Signup error:', err)
    return res.status(500).json({ error: 'internal' })
  }
})

export default router
