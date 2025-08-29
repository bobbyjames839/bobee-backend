// routes/bobee-message.ts
import { Router, Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { authenticate, AuthenticatedRequest } from "../../middleware/authenticate";
// @ts-ignore – kokoro-js has no TS types
import { KokoroTTS, TextSplitterStream } from "kokoro-js";

const router = Router();
const db = admin.firestore();

// === TTS config ===
const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-ONNX";
const KOKORO_DTYPE = "q8";
const KOKORO_VOICE_DEFAULT = "af_heart";
const KOKORO_SPEED_DEFAULT = 1.0;

// --- helpers ---
async function fetchWithTimeout(input: string, init: any, timeoutMs = 60000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// Singleton Kokoro loader
let kokoroReady: Promise<any> | null = null;
function getKokoro() {
  if (!kokoroReady) {
    kokoroReady = KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: KOKORO_DTYPE as any,
    });
  }
  return kokoroReady;
}

// Normalize audio object into { data: Float32Array, sr }
function toPCM(audioObj: any): { data: Float32Array; sr: number } {
  const sr = audioObj?.sample_rate || audioObj?.sampleRate || 24000;
  const arr =
    audioObj?.data instanceof Float32Array
      ? audioObj.data
      : audioObj?.audio instanceof Float32Array
      ? audioObj.audio
      : ArrayBuffer.isView(audioObj)
      ? (audioObj as Float32Array)
      : null;

  if (!arr) throw new Error("Unexpected audio object from kokoro-js");
  return { data: arr, sr };
}

// Build 16-bit PCM WAV buffer from Float32Array
function float32ToWavBytes(samples: Float32Array, sampleRate = 24000): Buffer {
  const s16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let x = samples[i];
    if (x > 1) x = 1;
    else if (x < -1) x = -1;
    s16[i] = x < 0 ? x * 0x8000 : x * 0x7fff;
  }
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const dataSize = s16.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  Buffer.from(s16.buffer).copy(buf, 44);
  return buf;
}

router.post("/", authenticate, async (req: Request, res: Response) => {
  const startTs = Date.now();
  const reqId = Math.random().toString(36).slice(2, 10);
  const log = (...args: any[]) =>
    console.log("[bobee-message]", reqId, ((Date.now() - startTs) + "ms").padStart(6), ...args);

  try {
    const uid = (req as AuthenticatedRequest).uid;

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const ENABLE_TTS = process.env.ENABLE_BOBEE_TTS !== "false";
    const KOKORO_VOICE = process.env.KOKORO_VOICE || KOKORO_VOICE_DEFAULT;
    const KOKORO_SPEED = parseFloat(process.env.KOKORO_SPEED || `${KOKORO_SPEED_DEFAULT}`);

    if (!OPENAI_API_KEY) return res.status(500).json({ error: "missing-openai-key" });
    if (!ENABLE_TTS) return res.status(500).json({ error: "tts-disabled" });

    // === Collect personalization context (unchanged) ===
    const since = Date.now() - 72 * 60 * 60 * 1000;
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() || {};

    const facts: string[] = Array.isArray(userData.facts)
      ? userData.facts.filter((f: any) => typeof f === "string" && f.trim()).slice(0, 30)
      : [];

    const profileSummaryRaw = (
      userData.profileSummary || userData.summary || userData.profile || userData.description || ""
    ).toString().trim();

    const displayName = (userData.firstName || userData.name || userData.displayName || "").toString().trim();
    const firstName = displayName.split(/\s+/)[0] || "";

    const journalsSnap = await db
      .collection("users").doc(uid).collection("journals")
      .where("createdAt", ">=", admin.firestore.Timestamp.fromMillis(since))
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    type J = { transcript?: string; aiResponse?: any; createdAt?: any };
    const entries: { createdAt: number; transcript: string; summary?: string }[] = [];
    journalsSnap.forEach((doc) => {
      const data = doc.data() as J;
      let createdAtMs = Date.now();
      const ca = data.createdAt;
      if (ca && typeof ca.toMillis === "function") createdAtMs = ca.toMillis();
      const transcript = (data.transcript || "").toString().trim();
      if (!transcript) return;
      const summary =
        data.aiResponse?.summary && typeof data.aiResponse.summary === "string" ? data.aiResponse.summary : undefined;
      entries.push({ createdAt: createdAtMs, transcript, summary });
    });

    let combined = entries
      .map((e) => {
        const dateStr = new Date(e.createdAt).toISOString().split("T")[0];
        return `Date: ${dateStr}\nEntry: ${e.transcript}${e.summary ? `\nAI Summary: ${e.summary}` : ""}`;
      })
      .join("\n\n");

    const NO_JOURNALS = entries.length === 0;
    if (!combined) combined = "No recent journal content.";
    const MAX_CHARS = 6000;
    if (combined.length > MAX_CHARS) combined = combined.slice(0, MAX_CHARS) + "\n... (truncated)";

    // === GPT-4o mini prompt (unchanged) ===
    const systemPrompt = [
      "ROLE: You are a compassionate, steady, friendly journaling companion generating a SHORT SPOKEN reflection for the user.",
      "OBJECTIVE: Empathetic reflective mini speech (~130–165 words) from provided material + stable user background facts.",
      "SOURCE: Only supplied journal excerpts and provided user background; no invention.",
      "PERSONALIZATION: Address the user by first name once near the beginning" + (firstName ? ` (name: ${firstName}).` : "."),
      "TONE: Warm, grounded; not clinical or preachy.",
      "STYLE: Varied sentence lengths; no bullets, no questions, no semicolons.",
      "LANGUAGE: Mix second-person with neutral observation; spell out one to ten.",
      "CONTENT: Surface themes/strengths; normalize setbacks; include 1–2 gentle forward-looking lines.",
      "SPARSE: If little/no content, ≤55 words encouragement.",
      "OUTPUT: ONLY the speech text. 1–4 short paragraphs. ≤165 words.",
    ].join("\n");

    const backgroundBlockParts: string[] = [];
    if (firstName) backgroundBlockParts.push(`firstName: ${firstName}`);
    if (profileSummaryRaw) backgroundBlockParts.push(`profileSummary: ${profileSummaryRaw}`);
    if (facts.length) backgroundBlockParts.push(`facts: ${facts.join(" | ")}`);

    const backgroundBlock = backgroundBlockParts.length
      ? "ADDITIONAL_USER_CONTEXT (derived from longer-term journal analysis; do not restate mechanically):\n" +
        backgroundBlockParts.join("\n")
      : "ADDITIONAL_USER_CONTEXT: none";

    const userPrompt = JSON.stringify({ recentJournals: combined, background: backgroundBlock });

    let speech =
      "Not enough recent journaling to generate a personalised reflection yet. Add an entry and try again soon.";
    if (!NO_JOURNALS) {
      try {
        const aiResp = await fetchWithTimeout(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              temperature: 0.65,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
            }),
          },
          45000
        );
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const raw = (aiData.choices?.[0]?.message?.content || "").trim();
          if (raw) speech = raw.slice(0, 1400);
        }
      } catch (err) {
        console.log("[bobee-message] openai exception", err);
      }
    }

    if (!speech) return res.status(400).json({ error: "no-speech" });
    console.log("[bobee-message]", reqId, "speech generated length=", speech.length);

    // === TTS with Kokoro using stream, but buffer to one WAV ===
    const tts = await getKokoro();
    const splitter = new TextSplitterStream();
    const kokoroStream = tts.stream(splitter, {
      voice: process.env.KOKORO_VOICE || KOKORO_VOICE_DEFAULT,
      speed: parseFloat(process.env.KOKORO_SPEED || `${KOKORO_SPEED_DEFAULT}`),
    });

    // Buffer all PCM chunks
    const pcmChunks: Float32Array[] = [];
    let sampleRate = 24000;

    const consume = (async () => {
      for await (const { audio } of kokoroStream) {
        if (!audio) continue;
        const { data, sr } = toPCM(audio);
        sampleRate = sr || sampleRate;
        // copy to avoid holding on to underlying ArrayBuffer if reused
        pcmChunks.push(new Float32Array(data));
      }
    })();

    // Feed the whole speech (simple)
    splitter.push(speech);
    splitter.close();

    await consume;

    // Concatenate PCM and build one WAV
    const totalLen = pcmChunks.reduce((acc, a) => acc + a.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of pcmChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const wavBuf = float32ToWavBytes(merged, sampleRate);
    const b64 = wavBuf.toString("base64");

    // Respond JSON compatible with RN client
    res.json({
      speech,
      audio: { b64, sr: sampleRate, mime: "audio/wav" },
      ms: Date.now() - startTs,
    });

    // record last message (async)
    db.collection("users")
      .doc(uid)
      .set({ lastBobeeMessage: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .catch((err) => console.log("[bobee-message] error updating lastBobeeMessage", err));
  } catch (e) {
    console.error("[bobee-message]", reqId, "ERROR", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "bobee-message-failed", detail: String(e).slice(0, 400) });
    }
  }
});

export default router;
