import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import serverless from 'serverless-http';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const RESOLVED_GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEYS;
console.log(`[startup] Gemini key present: ${!!RESOLVED_GEMINI_KEY}, length: ${RESOLVED_GEMINI_KEY ? RESOLVED_GEMINI_KEY.length : 0}`);
const ai = new GoogleGenAI({ apiKey: RESOLVED_GEMINI_KEY });

// Endpoint: Identify
app.post('/api/identify', async (req, res) => {
  try {
    const { imageBuffer, frames, mimeType, correction, hint } = req.body;
    const images = (Array.isArray(frames) && frames.length) ? frames : (imageBuffer ? [imageBuffer] : []);
    if (!images.length) return res.status(400).json({ error: 'No image data provided' });

    let promptText = images.length > 1
      ? `You are shown ${images.length} frames captured at different moments from the SAME short video clip. Use all of them together as evidence (a clear frame can confirm a blurrier one). Identify the movie or TV show. Be careful: recognizing an actor's face is not the same as knowing which specific title you're looking at — many actors appear together in more than one project, so don't guess a title just because you recognize the cast; only report HIGH confidence if you're sure of this exact scene. Return ONLY a raw JSON object with these keys: title, year, type, confidence (HIGH/MEDIUM/LOW). Do not include any markdown formatting or extra text. If you cannot identify it from any frame, return {"title":"UNKNOWN","year":0,"type":"MOVIE","confidence":"LOW"}.`
      : `Identify the movie or show from this frame. Be careful: recognizing an actor's face is not the same as knowing which specific title you're looking at — many actors appear together in more than one project, so don't guess a title just because you recognize the cast. Return ONLY a raw JSON object with these keys: title, year, type, confidence (HIGH/MEDIUM/LOW). Do not include any markdown formatting or extra text. If you cannot identify it, return {"title":"UNKNOWN","year":0,"type":"MOVIE","confidence":"LOW"}.`;

    if (correction && correction.rejectedTitle) {
      promptText += ` IMPORTANT — SELF-CORRECTION NEEDED: your previous answer was "${correction.rejectedTitle}", but that title's real cast is: ${correction.actualCast || 'unknown'}, which does not match the actor(s) you described (${correction.mentionedActors || 'unclear'}). That guess was WRONG — do not repeat it. These same actors likely appear together in a different film or show; identify that one instead, or return UNKNOWN if you genuinely cannot.`;
    }

    if (hint && String(hint).trim()) {
      const clean = String(hint).trim().slice(0, 500);
      promptText += ` VIEWER-PROVIDED DESCRIPTION (optional context, may be vague or slightly wrong — weigh it alongside the actual visual evidence rather than accepting it uncritically): "${clean}".`;
    }

    console.log(`[identify] calling Gemini with ${images.length} image(s)...`);
    const t0 = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          parts: [
            { text: promptText },
            ...images.map(img => ({
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: img
              }
            }))
          ]
        }
      ]
    });
    console.log(`[identify] Gemini responded in ${Date.now() - t0}ms`);

    let text = response.text;
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    res.json(JSON.parse(match[0]));

  } catch (error) {
    console.error('Identification Error:', error.message);
    res.status(500).json({ error: 'We had trouble analysing that scene. Please try again.' });
  }
});

// Endpoint: TMDB Proxy
app.get('/api/tmdb', async (req, res) => {
  try {
    const { path } = req.query;
    const response = await fetch(`https://api.themoviedb.org/3${path}`, {
      headers: { 'Authorization': `Bearer ${process.env.TMDB_READ_TOKEN}`, 'Content-Type': 'application/json' }
    });
    res.json(await response.json());
  } catch (error) {
    res.status(500).json({ error: 'TMDB proxy failed' });
  }
});

// Endpoint: Watchmode Proxy
app.get('/api/watchmode', async (req, res) => {
  try {
    const { query } = req.query;
    const response = await fetch(
      `https://api.watchmode.com/v1/search/?apiKey=${process.env.WATCHMODE_API_KEY}&search_field=title&search_value=${encodeURIComponent(query)}`
    );
    res.json(await response.json());
  } catch (error) {
    res.status(500).json({ error: 'Watchmode proxy failed' });
  }
});

export default serverless(app);