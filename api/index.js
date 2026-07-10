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
  const { imageBuffer, mimeType, description } = req.body;
  if (!imageBuffer) return res.status(400).json({ error: 'No image buffer provided' });

  const token = process.env.GITHUB_TOKEN;

  try {
    const promptText = `You are an expert movie and TV show identifier.
Analyze this image frame carefully:
1. Identify ALL visible actors by their face
2. Note the costumes, setting, props, era
3. Read ANY visible text, subtitles, watermarks, or titles on screen
${description ? `\nAdditional scene details/context provided by the user:\n"${description}"\nCombine this user description with the visual cues to identify the movie/show.` : ''}

Then output EXACTLY a raw JSON object with these keys (do not include any markdown formatting, extra text, or prefix):
{
  "title": "[exact title or UNKNOWN]",
  "year": [4-digit integer year, or 0 if unknown],
  "type": "[MOVIE or TV]",
  "confidence": "[HIGH or MEDIUM or LOW]",
  "reason": "[brief sentence explaining what visual evidence confirmed this]"
}`;

    const response = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptText
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${imageBuffer}`
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GitHub Models API HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    if (!text) throw new Error('Empty response from gpt-4o');

    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in response');

    const result = JSON.parse(match[0]);
    let { title, year, type, confidence, reason } = result;

    if (!title || title.toUpperCase() === 'UNKNOWN') {
      return res.status(200).json({ title: 'UNKNOWN', year: 0, type: 'MOVIE' });
    }

    const parsedType = (type && (type.toUpperCase() === 'TV' || type.toUpperCase() === 'SERIES')) ? 'SERIES' : 'MOVIE';
    const parsedConf = confidence ? confidence.toUpperCase() : 'HIGH';

    if (parsedConf === 'LOW') {
      return res.status(200).json({ title: 'UNKNOWN', year: 0, type: 'MOVIE' });
    }

    return res.json({
      title,
      year: parseInt(year) || year || 'UNKNOWN',
      type: parsedType,
      confidence: parsedConf,
      reason: reason || 'Identified via GPT-4o on GitHub Models.'
    });

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
