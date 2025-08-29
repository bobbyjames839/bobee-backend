// ws/bobeeMessageWS.ts
import WebSocket, { WebSocketServer } from "ws";
import admin from "firebase-admin";
import fetch from "node-fetch";
// @ts-ignore
import { KokoroTTS, TextSplitterStream } from "kokoro-js";

const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-ONNX";
const KOKORO_DTYPE = "q8";
const KOKORO_VOICE_DEFAULT = "af_sarah";
const KOKORO_SPEED_DEFAULT = 1.0;

const db = admin.firestore();

async function fetchWithTimeout(input: string, init: any, timeoutMs = 60000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(t); }
}

// Singleton Kokoro
let kokoroReady: Promise<any> | null = null;
function getKokoro() {
  if (!kokoroReady) {
    kokoroReady = KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: KOKORO_DTYPE as any });
  }
  return kokoroReady;
}

// Normalize Kokoro audio obj
function toPCM(audioObj: any): { data: Float32Array; sr: number } {
  const sr = audioObj?.sample_rate || audioObj?.sampleRate || 24000;
  const arr =
    audioObj?.data instanceof Float32Array ? audioObj.data :
    audioObj?.audio instanceof Float32Array ? audioObj.audio :
    (ArrayBuffer.isView(audioObj) ? audioObj as Float32Array : null);
  if (!arr) throw new Error("Unexpected audio object from kokoro-js");
  return { data: arr, sr };
}

// Build 16-bit PCM WAV from Float32
function float32ToWavBytes(samples: Float32Array, sampleRate = 24000): Buffer {
  const s16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let x = samples[i];
    if (x > 1) x = 1; else if (x < -1) x = -1;
    s16[i] = x < 0 ? x * 0x8000 : x * 0x7FFF;
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
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  Buffer.from(s16.buffer).copy(buf, 44);
  return buf;
}

// Verify Firebase ID token; return uid or throw
async function verifyIdToken(idToken: string): Promise<string> {
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// Export a function you can call from your server setup
export function attachBobeeMessageWSServer(httpServer: any, path = "/ws/bobee-message") {
  const wss = new WebSocketServer({ server: httpServer, path });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token") || "";

    let uid = "";
    try {
      uid = await verifyIdToken(token);
    } catch (e: any) {
      ws.send(JSON.stringify({ type: "error", message: "auth-failed" }));
      ws.close();
      return;
    }

    const startTs = Date.now();
    const reqId = Math.random().toString(36).slice(2, 10);
    const log = (...a: any[]) => console.log("[bobee-ws]", reqId, (Date.now() - startTs) + "ms", ...a);

    // Close handling
    let closed = false;
    ws.on("close", () => { closed = true; });

    try {
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

      if (!OPENAI_API_KEY) throw new Error("missing-openai-key");

      // --- personalization (same as your HTTP route) ---
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
      journalsSnap.forEach(doc => {
        const data = doc.data() as J;
        let createdAtMs = Date.now();
        const ca = data.createdAt;
        if (ca && typeof ca.toMillis === "function") createdAtMs = ca.toMillis();
        const transcript = (data.transcript || "").toString().trim();
        if (!transcript) return;
        const summary = (typeof data.aiResponse?.summary === "string") ? data.aiResponse.summary : undefined;
        entries.push({ createdAt: createdAtMs, transcript, summary });
      });

      let combined = entries
        .map(e => {
          const dateStr = new Date(e.createdAt).toISOString().split("T")[0];
          return `Date: ${dateStr}\nEntry: ${e.transcript}${e.summary ? `\nAI Summary: ${e.summary}` : ""}`;
        })
        .join("\n\n");

      const NO_JOURNALS = entries.length === 0;
      if (!combined) combined = "No recent journal content.";
      const MAX_CHARS = 6000;
      if (combined.length > MAX_CHARS) combined = combined.slice(0, MAX_CHARS) + "\n... (truncated)";

      const systemPrompt = [
        "ROLE: You are a close, supportive friend who has been reading the user’s journal. Speak in a natural, conversational way—like you’re actually talking to them.",
        "",
        "OBJECTIVE: Give a short spoken-style reflection (~130–165 words) that feels warm, personal, and genuine. Share your own little opinions or thoughts on what you notice, as a real friend would.",
        "",
        "STYLE: Use everyday, easygoing language. Mix in casual phrases like “I feel like…”, “honestly…”, “it’s kinda cool that…”. Vary your sentence lengths so it doesn’t sound scripted. No bullet points, no lists.",
        "",
        "TONE: Friendly, relaxed, and encouraging. Not formal, not clinical, not preachy. A little playful or humorous when it feels right.",
        "",
        "CONTENT: Highlight the patterns, moods, and efforts you see. Normalize the tough parts, and cheer on the good ones. Offer gentle, forward-looking thoughts—like what a friend might say if they cared and wanted the user to feel hopeful.",
        "",
        "DELIVERY: Write as if spoken naturally but without pauses or breaks between sentences (especially at the start). Keep the flow smooth and continuous, almost like you’re chatting in one breath.",
        "",
        "PERSONALIZATION: Use the user’s first name near the start. If there’s little recent content, keep it short (≤55 words) and just drop a light, supportive comment."
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

      let speech = "Not enough recent journaling to generate a personalised reflection yet. Add an entry and try again soon.";
      if (!NO_JOURNALS) {
        const aiResp = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
        }, 45000);
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const raw = (aiData.choices?.[0]?.message?.content || "").trim();
          if (raw) speech = raw.slice(0, 1400);
        }
      }

      if (closed) return;
      ws.send(JSON.stringify({ type: "speech", text: speech }));

      // --- stream TTS chunks as independent WAV microfiles ---
      const tts = await getKokoro();
      const splitter = new TextSplitterStream();
      const stream = tts.stream(splitter, {
        voice: KOKORO_VOICE_DEFAULT,
        speed: KOKORO_SPEED_DEFAULT,
      });

      let seq = 0;
      (async () => {
        try {
          for await (const { audio } of stream) {
            if (closed || !audio) continue;
            const { data, sr } = toPCM(audio);
            // Build a valid tiny WAV for this chunk
            const wavBuf = float32ToWavBytes(data, sr);
            ws.send(JSON.stringify({
              type: "audio",
              seq: seq++,
              sr,
              mime: "audio/wav",
              b64: wavBuf.toString("base64"),
            }));
          }
          if (!closed) ws.send(JSON.stringify({ type: "end" }));
          // record timestamp
          db.collection("users").doc(uid)
            .set({ lastBobeeMessage: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
            .catch(() => {});
        } catch (err: any) {
          if (!closed) ws.send(JSON.stringify({ type: "error", message: String(err) }));
        } finally {
          try { ws.close(); } catch {}
        }
      })();

      // feed speech all at once (or word-by-word if you prefer)
      splitter.push(speech);
      splitter.close();
    } catch (err: any) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "error", message: String(err) }));
        ws.close();
      }
    }
  });

  return wss;
}
