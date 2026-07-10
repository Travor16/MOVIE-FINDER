import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import serverless from 'serverless-http';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GEMINI_KEYS });

// Endpoint: Identify
app.post('/api/identify', async (req, res) => {
  try {
    const { imageBuffer, mimeType, description } = req.body;
    if (!imageBuffer) return res.status(400).json({ error: 'No image buffer provided' });

    const systemPromptText = `Identify the movie or show from this frame. Return ONLY a raw JSON object with these keys: title, year, type. Do not include any markdown formatting or extra text.${description ? ` Additionally, use this user-provided description to help you identify the scene: "${description}"` : ''}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          parts: [
            {
              text: systemPromptText
            },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: imageBuffer
              }
            }
          ]
        }
      ]
    });

    let text = response.text;
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    res.json(JSON.parse(match[0]));

  } catch (error) {
    console.error('Identification Error:', error.message);
    res.status(500).json({ error: 'Failed to identify media', details: error.message });
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
