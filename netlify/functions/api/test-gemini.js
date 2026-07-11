import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(express.json({ limit: '50mb' }));

const RESOLVED_GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEYS;
console.log(`[test-gemini] Gemini key present: ${!!RESOLVED_GEMINI_KEY}, length: ${RESOLVED_GEMINI_KEY ? RESOLVED_GEMINI_KEY.length : 0}`);

if (!RESOLVED_GEMINI_KEY) {
  app.get('/', (req, res) => res.json({ error: 'Gemini key not configured' }));
  export const handler = serverless(app);
  return;
}

const genAI = new GoogleGenerativeAI(RESOLVED_GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

app.post('/', async (req, res) => {
  try {
    const result = await model.generateContent('Say hello');
    const text = await result.response.text();
    res.json({ response: text.trim() });
  } catch (err) {
    console.error('[test-gemini] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export const handler = serverless(app);