/*import * as FileSystem from 'expo-file-system';

export async function transcribeAudio(uri: string): Promise<string> {
  const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not provided. Make sure EXPO_PUBLIC_OPENAI_API_KEY is set.');
  }

  const fileInfo = await FileSystem.getInfoAsync(uri, { size: false });
  if (!fileInfo.exists) {
    throw new Error('Recording file not found on disk.');
  }

  let mimeType = 'audio/webm';
  let fileName = 'audio.webm';

  if (uri.endsWith('.caf')) {
    mimeType = 'audio/x-caf';
    fileName = 'audio.caf';
  } else if (uri.endsWith('.m4a')) {
    mimeType = 'audio/mp4';
    fileName = 'audio.m4a';
  } else if (uri.endsWith('.wav')) {
    mimeType = 'audio/wav';
    fileName = 'audio.wav';
  }

  const formData = new FormData();
  formData.append(
    'file',
    {
      uri,
      name: fileName,
      type: mimeType,
    } as any
  );
  formData.append('model', 'gpt-4o-mini-transcribe');

  const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData as any,
  });

  const result = await openaiRes.json();
  if (!openaiRes.ok) {
    console.error('Whisper error:', result);
    const message = result.error?.message || JSON.stringify(result);
    throw new Error(`Transcription failed (${openaiRes.status}): ${message}`);
  }

  if (typeof result.text !== 'string') {
    throw new Error('Transcription returned no text.');
  }

  return result.text.trim();
}
*/



// src/routes/transcribeAudio.ts
import 'dotenv/config';
import express, { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const TMP_DIR = path.join(__dirname, '../tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR });
const router = express.Router();

interface WhisperResponse { text?: string; error?: { message: string }; }

router.post('/', upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Missing "audio" upload' });
  }

  const { path: filepath, originalname, mimetype } = req.file;
  console.log('Received', originalname, 'as', filepath, mimetype);

  try {
    // build the multipart form using the correct filename + mimetype
    const form = new FormData();
    form.append('file', fs.createReadStream(filepath), {
      filename: originalname,
      contentType: mimetype,
    });
    form.append('model', 'gpt-4o-mini-transcribe');

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
    const openaiRes = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, ...form.getHeaders() },
        body: form as any,
      }
    );

    const json = (await openaiRes.json()) as WhisperResponse;
    if (!openaiRes.ok) {
      const msg = json.error?.message ?? JSON.stringify(json);
      throw new Error(`Whisper error (${openaiRes.status}): ${msg}`);
    }
    if (typeof json.text !== 'string') {
      throw new Error('No transcription returned');
    }

    res.json({ text: json.text.trim() });
  } catch (err: any) {
    console.error('Transcription failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    // always clean up the temp file
    fs.unlink(filepath, () => {});
  }
});

export default router;
