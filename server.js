import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Increase JSON body limit to support base64 images
app.use(express.json({ limit: '50mb' }));

// Helper function to handle Gemini API generation with rate limit retries and grounding fallback
async function generateWithRetry(payload, retries = 3, initialDelay = 3000) {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      // Attempt to identify with Google Search Grounding enabled
      return await ai.models.generateContent({
        ...payload,
        config: {
          tools: [{ googleSearch: {} }],
          ...payload.config
        }
      });
    } catch (searchError) {
      const isRateLimit = searchError.status === 429 || searchError.statusCode === 429 || 
                          searchError.message?.includes('429') || searchError.message?.includes('Quota exceeded') ||
                          searchError.message?.includes('ResourceExhausted') || searchError.message?.includes('rate-limits');

      if (isRateLimit && i < retries - 1) {
        console.warn(`Rate limit hit on Search Grounding. Retrying in ${delay / 1000}s... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }

      console.warn('Gemini Search Grounding failed, falling back to standard generation:', searchError.message);
      
      // Fallback without search grounding (useful if key has tier restrictions)
      try {
        return await ai.models.generateContent(payload);
      } catch (fallbackError) {
        const isFallbackRateLimit = fallbackError.status === 429 || fallbackError.statusCode === 429 || 
                                    fallbackError.message?.includes('429') || fallbackError.message?.includes('Quota exceeded') ||
                                    fallbackError.message?.includes('ResourceExhausted') || fallbackError.message?.includes('rate-limits');
        
        if (isFallbackRateLimit && i < retries - 1) {
          console.warn(`Rate limit hit on fallback. Retrying in ${delay / 1000}s... (Attempt ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
        throw fallbackError;
      }
    }
  }
}

// Gemini SDK Call
app.post('/api/identify', async (req, res) => {
  try {
    const parts = req.body.contents?.[0]?.parts || [];
    const textPart = parts.find(p => p.text);
    const imagePart = parts.find(p => p.inline_data);
    
    if (!textPart || !imagePart) {
      return res.status(400).json({ error: { message: 'Invalid request payload structure' } });
    }
    
    const payload = {
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: imagePart.inline_data.mime_type,
            data: imagePart.inline_data.data
          }
        },
        textPart.text
      ],
      config: {
        temperature: req.body.generationConfig?.temperature ?? 0.1,
        maxOutputTokens: req.body.generationConfig?.maxOutputTokens ?? 300
      }
    };

    const response = await generateWithRetry(payload);

    res.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: response.text
              }
            ]
          }
        }
      ]
    });
  } catch (error) {
    console.error('Gemini SDK error after retries:', error);
    // Provide a friendly error message if they ultimately exceed limits
    let userFriendlyMessage = error.message;
    if (error.status === 429 || error.message?.includes('Quota exceeded') || error.message?.includes('rate-limits')) {
      userFriendlyMessage = 'The server is currently busy due to a high rate of searches. Please wait 10 seconds and try again.';
    }
    res.status(500).json({ error: { message: userFriendlyMessage } });
  }
});

// TMDB Proxy
app.get('/api/tmdb', async (req, res) => {
  try {
    const tmdbPath = req.query.path;
    if (!tmdbPath) {
      return res.status(400).json({ error: 'Missing path parameter' });
    }
    const url = `https://api.themoviedb.org/3${tmdbPath}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.TMDB_READ_TOKEN}`,
        'accept': 'application/json'
      }
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('TMDB proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Watchmode Search Proxy
app.get('/api/watchmode/search', async (req, res) => {
  try {
    const { imdb_id, title } = req.query;
    const apiKey = process.env.WATCHMODE_API_KEY;
    let url = '';
    if (imdb_id) {
      url = `https://api.watchmode.com/v1/search/?apiKey=${apiKey}&search_field=imdb_id&search_value=${imdb_id}`;
    } else if (title) {
      url = `https://api.watchmode.com/v1/search/?apiKey=${apiKey}&search_field=name&search_value=${encodeURIComponent(title)}`;
    } else {
      return res.status(400).json({ error: 'Missing imdb_id or title parameter' });
    }
    
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Watchmode search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Watchmode Sources Proxy
app.get('/api/watchmode/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const apiKey = process.env.WATCHMODE_API_KEY;
    const url = `https://api.watchmode.com/v1/title/${id}/sources/?apiKey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Watchmode sources error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files, ignoring dotfiles like .env
app.use(express.static(__dirname, { dotfiles: 'ignore' }));

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
