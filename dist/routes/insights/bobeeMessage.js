"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const router = express_1.default.Router();
// -------------------- ENV & CONSTANTS --------------------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || "";
const REPLICATE_MODEL = "jaaari/kokoro-82m:f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13";
const KOKORO_VOICE = "af_sarah";
const db = firebase_admin_1.default.firestore();
// -------------------- UTILS --------------------
function nowMs() { return Date.now(); }
function withTimeout(promise, ms, tag = "timeout") {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error(tag)), ms)),
    ]).finally(() => clearTimeout(t));
}
async function fetchWithTimeout(url, init = {}, timeoutMs = 60000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await (0, node_fetch_1.default)(url, { ...init, signal: ctrl.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
// (Removed legacy streaming + deep output URL scanning; keeping implementation minimal.)
async function verifyIdToken(idToken) {
    const decoded = await firebase_admin_1.default.auth().verifyIdToken(idToken);
    return decoded.uid;
}
// -------------------- OPENAI TEXT GENERATION --------------------
async function buildSpeechForUser(uid) {
    if (!OPENAI_API_KEY) {
        // fallback text
        return "Hey, I don’t have enough recent journaling to work with yet, but I’m here when you’re ready to add something new.";
    }
    // pull recent journals
    const since = nowMs() - 72 * 60 * 60 * 1000;
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() || {};
    const facts = Array.isArray(userData.facts)
        ? userData.facts.filter((f) => typeof f === "string" && f.trim()).slice(0, 30)
        : [];
    const profileSummaryRaw = (userData.profileSummary || userData.summary || userData.profile || userData.description || "").toString().trim();
    const displayName = (userData.firstName || userData.name || userData.displayName || "").toString().trim();
    const firstName = displayName.split(/\s+/)[0] || "";
    const journalsSnap = await db
        .collection("users").doc(uid).collection("journals")
        .where("createdAt", ">=", firebase_admin_1.default.firestore.Timestamp.fromMillis(since))
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
    const entries = [];
    journalsSnap.forEach(doc => {
        const data = doc.data();
        let createdAtMs = nowMs();
        const ca = data.createdAt;
        if (ca && typeof ca.toMillis === "function")
            createdAtMs = ca.toMillis();
        const transcript = (data.transcript || "").toString().trim();
        if (!transcript)
            return;
        const summary = (typeof data.aiResponse?.summary === "string") ? data.aiResponse.summary : undefined;
        entries.push({ createdAt: createdAtMs, transcript, summary });
    });
    const NO_JOURNALS = entries.length === 0;
    let combined = entries.map(e => {
        const dateStr = new Date(e.createdAt).toISOString().split("T")[0];
        return `Date: ${dateStr}\nEntry: ${e.transcript}${e.summary ? `\nAI Summary: ${e.summary}` : ""}`;
    }).join("\n\n");
    if (!combined)
        combined = "No recent journal content.";
    const MAX_CHARS = 6000;
    if (combined.length > MAX_CHARS)
        combined = combined.slice(0, MAX_CHARS) + "\n... (truncated)";
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
    const backgroundBlockParts = [];
    if (firstName)
        backgroundBlockParts.push(`firstName: ${firstName}`);
    if (profileSummaryRaw)
        backgroundBlockParts.push(`profileSummary: ${profileSummaryRaw}`);
    if (facts.length)
        backgroundBlockParts.push(`facts: ${facts.join(" | ")}`);
    const backgroundBlock = backgroundBlockParts.length
        ? "ADDITIONAL_USER_CONTEXT:\n" + backgroundBlockParts.join("\n")
        : "ADDITIONAL_USER_CONTEXT: none";
    const userPrompt = JSON.stringify({ recentJournals: combined, background: backgroundBlock });
    // If no journals, return short fallback to avoid OpenAI call
    if (NO_JOURNALS) {
        return firstName
            ? `${firstName}, there isn’t much new to go on yet, but I’m here when you want to jot a few thoughts down.`
            : "There isn’t much new to go on yet, but I’m here when you want to jot a few thoughts down.";
    }
    const resp = await withTimeout((0, node_fetch_1.default)("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.65,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
        }),
    }), 45000, "openai-timeout");
    if (!("ok" in resp) || !resp.ok) {
        return firstName
            ? `${firstName}, I’m having a little trouble phrasing this right now—mind trying again in a minute?`
            : "I’m having a little trouble phrasing this right now—mind trying again in a minute?";
    }
    const data = await resp.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    return text ? text.slice(0, 1400) : "I’m here for you. Let’s pick this up again soon.";
}
// -------------------- REPLICATE (KOKORO) PREDICTION POLL (robust & concise) --------------------
function extractAudioUrl(out) {
    if (!out)
        return;
    if (typeof out === 'string' && out.startsWith('http'))
        return out;
    if (Array.isArray(out)) {
        for (const item of out) {
            const u = extractAudioUrl(item);
            if (u)
                return u;
        }
        return;
    }
    if (typeof out === 'object') {
        if (typeof out.url === 'string' && out.url.startsWith('http'))
            return out.url;
        if (Array.isArray(out.output)) {
            const u = extractAudioUrl(out.output);
            if (u)
                return u;
        }
        if (Array.isArray(out.audio)) {
            const u = extractAudioUrl(out.audio);
            if (u)
                return u;
        }
    }
}
async function pollPrediction(id, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const r = await (0, node_fetch_1.default)(`https://api.replicate.com/v1/predictions/${id}`, { headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` } });
        if (!r.ok)
            throw new Error('replicate-prediction-fetch-failed');
        const js = await r.json();
        if (js.status === 'succeeded' || js.status === 'failed' || js.status === 'canceled')
            return js;
        await new Promise(r => setTimeout(r, 900));
    }
    throw new Error('replicate-prediction-timeout');
}
async function runPrediction(input) {
    const version = REPLICATE_MODEL.includes(':') ? REPLICATE_MODEL.split(':')[1] : REPLICATE_MODEL;
    const resp = await (0, node_fetch_1.default)('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
        body: JSON.stringify({ version, input })
    });
    if (!resp.ok)
        throw new Error('replicate-prediction-create-failed');
    const created = await resp.json();
    return pollPrediction(created.id);
}
async function synthKokoro(text) {
    if (!REPLICATE_API_TOKEN)
        throw new Error('missing REPLICATE_API_TOKEN');
    const voicesTried = [];
    const voices = Array.from(new Set([KOKORO_VOICE, 'af_nicole', 'af_sarah', 'af_bella'])).filter(Boolean);
    let lastLogs = '';
    for (const voice of voices) {
        voicesTried.push(voice);
        try {
            const pred = await runPrediction({ text, voice });
            lastLogs = (pred.logs || '').toString();
            if (pred.status !== 'succeeded')
                continue;
            const url = extractAudioUrl(pred.output);
            if (!url)
                continue;
            const audioResp = await fetchWithTimeout(url, {}, 60000);
            if (!audioResp.ok)
                continue;
            const ab = await audioResp.arrayBuffer();
            const buf = Buffer.from(ab);
            const isWav = buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE';
            console.log('[kokoro] success voice', voice, 'bytes', buf.length);
            return { buffer: buf, mime: isWav ? 'audio/wav' : 'audio/mpeg', ext: isWav ? 'wav' : 'mp3' };
        }
        catch (e) {
            console.log('[kokoro] attempt failed voice', voice, e?.message);
        }
    }
    console.log('[kokoro] all voices failed', voicesTried, 'logsTail', lastLogs.slice(-200));
    throw new Error('replicate-no-audio-url');
}
// -------------------- HTTP ROUTE --------------------
router.post('/', async (req, res) => {
    const started = nowMs();
    const reqId = Math.random().toString(36).slice(2, 10);
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    try {
        if (!bearer)
            return res.status(401).json({ error: 'auth-missing' });
        const uid = await verifyIdToken(bearer);
        const speech = await buildSpeechForUser(uid);
        const synth = await synthKokoro(speech);
        const b64 = synth.buffer.toString('base64');
        // best-effort last message timestamp
        db.collection('users').doc(uid)
            .set({ lastBobeeMessage: firebase_admin_1.default.firestore.FieldValue.serverTimestamp() }, { merge: true })
            .catch(() => { });
        console.log('[bobee-message]', reqId, (nowMs() - started) + 'ms', 'ok', 'speechChars', speech.length, 'audioBytes', synth.buffer.length);
        res.json({ speech, audio: { b64, mime: synth.mime, ext: synth.ext } });
    }
    catch (err) {
        const msg = err?.message || String(err);
        console.log('[bobee-message]', reqId, (nowMs() - started) + 'ms', 'error', msg);
        res.status(500).json({ error: msg });
    }
});
exports.default = router;
