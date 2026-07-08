import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize Gemini with the variable name from your Vercel Dashboard
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEYS);

// Endpoint: Identify
app.post('/api/identify', async (req, res) => {
    try {
        const { imageBuffer, mimeType } = req.body;
        
        if (!imageBuffer) {
            return res.status(400).json({ error: 'No image buffer provided' });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const result = await model.generateContent([
            "Identify the movie or show from this frame. Return ONLY a raw JSON object with these keys: title, year, type. Do not include any markdown formatting or extra text.",
            {
                inlineData: {
                    data: imageBuffer,
                    mimeType: mimeType || 'image/jpeg'
                }
            }
        ]);

        const response = await result.response;
        let text = response.text();
        
        // Robust cleaning: Remove markdown code blocks if the AI includes them
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const jsonResponse = JSON.parse(text);
        res.json(jsonResponse);

    } catch (error) {
        console.error('Identification Error:', error);
        res.status(500).json({ error: 'Failed to identify media', details: error.message });
    }
});

// Endpoint: TMDB Proxy
app.get('/api/tmdb', async (req, res) => {
    try {
        const { path } = req.query;
        // Use your specific Vercel environment variable
        const TMDB_TOKEN = process.env.TMDB_READ_TOKEN;
        
        const response = await fetch(`https://api.themoviedb.org/3${path}`, {
            headers: {
                'Authorization': `Bearer ${TMDB_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'TMDB proxy failed' });
    }
});

// Endpoint: Watchmode Proxy
app.get('/api/watchmode', async (req, res) => {
    try {
        // Ensure WATCHMODE_API_KEY is also set in your Vercel dashboard
        const apiKey = process.env.WATCHMODE_API_KEY;
        const { query } = req.query;
        
        const response = await fetch(`https://api.watchmode.com/v1/search/?apiKey=${apiKey}&search_field=title&search_value=${encodeURIComponent(query)}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Watchmode proxy failed' });
    }
});

export default app;