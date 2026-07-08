import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allows larger image payloads

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Endpoint: Identify
app.post('/api/identify', async (req, res) => {
    try {
        const { imageBuffer, mimeType } = req.body;
        
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const result = await model.generateContent([
            "Identify the movie/show from this frame. Return ONLY JSON: {title, year, type}",
            {
                inlineData: {
                    data: imageBuffer,
                    mimeType: mimeType
                }
            }
        ]);

        const response = await result.response;
        const text = response.text();
        res.json(JSON.parse(text));

    } catch (error) {
        console.error('Identification Error:', error);
        res.status(500).json({ error: 'Failed to identify media' });
    }
});

// Endpoint: TMDB Proxy (Example structure)
app.get('/api/tmdb', async (req, res) => {
    // Add your TMDB fetch logic here using import-based fetch
    res.json({ status: 'TMDB endpoint active' });
});

// Endpoint: Watchmode Proxy (Example structure)
app.get('/api/watchmode', async (req, res) => {
    // Add your Watchmode fetch logic here
    res.json({ status: 'Watchmode endpoint active' });
});

export default app;