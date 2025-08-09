import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'

const router = Router()
const auth = admin.auth()
const db = admin.firestore()

const MIN_PASSWORD_LENGTH = 8


router.post('/', async (req: Request, res: Response) => {
  try {
    const nameRaw = String(req.body?.name || '').trim()
    const emailRaw = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')

    if (!nameRaw) return res.status(400).json({ error: 'name required' })
    if (!emailRaw) return res.status(400).json({ error: 'email required' })
    if (!password) return res.status(400).json({ error: 'password required' })
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `weak-password` })
    }

    const photoURL = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(nameRaw)}`
    const userRecord = await auth.createUser({
      email: emailRaw,
      password,
      displayName: nameRaw,
      photoURL,
      emailVerified: false,
      disabled: false,
    })

    const uid = userRecord.uid
    const batch = db.batch()
    const userInfoRef = db.collection('users').doc(uid).collection('metrics').doc('userInfo')
    const statsRef = db.collection('users').doc(uid).collection('metrics').doc('stats')

    batch.set(userInfoRef, {
      name: nameRaw,
      email: emailRaw,
      subscribed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      photoURL,
    })

    const today = new Date().toISOString().split('T')[0]
    batch.set(statsRef, {
      voiceUsage: { date: today, totalSeconds: 0 },
      totalWords: 0,
      totalEntries: 0,
      currentStreak: 0,
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
