"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const form_data_1 = __importDefault(require("form-data"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const TMP_DIR = path_1.default.join(__dirname, '../tmp');
if (!fs_1.default.existsSync(TMP_DIR))
    fs_1.default.mkdirSync(TMP_DIR, { recursive: true });
const upload = (0, multer_1.default)({ dest: TMP_DIR });
const router = express_1.default.Router();
router.post('/', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Missing "audio" upload' });
    }
    const { path: filepath, originalname, mimetype } = req.file;
    try {
        const form = new form_data_1.default();
        form.append('file', fs_1.default.createReadStream(filepath), {
            filename: originalname,
            contentType: mimetype,
        });
        form.append('model', 'gpt-4o-mini-transcribe');
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        const openaiRes = await (0, node_fetch_1.default)('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, ...form.getHeaders() },
            body: form,
        });
        const json = (await openaiRes.json());
        if (!openaiRes.ok) {
            const msg = json.error?.message ?? JSON.stringify(json);
            throw new Error(`Whisper error (${openaiRes.status}): ${msg}`);
        }
        if (typeof json.text !== 'string') {
            throw new Error('No transcription returned');
        }
        res.json({ text: json.text.trim() });
    }
    catch (err) {
        console.error('Transcription failed:', err);
        res.status(500).json({ error: err.message });
    }
    finally {
        fs_1.default.unlink(filepath, () => { });
    }
});
exports.default = router;
