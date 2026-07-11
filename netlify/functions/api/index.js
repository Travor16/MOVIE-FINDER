import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TMDB_TOKEN   = process.env.TMDB_READ_TOKEN;
const WATCHMODE_KEY= process.env.WATCHMODE_API_KEY;

/* ---------- PROMPTS (same as your local server.js) ---------- */
const PROMPT_SINGLE = `You are a movie and TV series identification expert. Look at this image carefully.

Identify the exact movie OR TV series this scene is from.

Look for: actor faces, costumes, props, setting, any on-screen text, subtitles, watermarks, logos, cinematography style.

Be careful: recognizing an actor's face is not the same as knowing which specific film you're looking at — many actors appear together in more than one project. Only use HIGH confidence if you're sure of this exact scene/film, not just the actors in it. If you recognize the people but are unsure of the specific title, use MEDIUM confidence and say so in REASON.

Reply in this EXACT format only:
TITLE: [exact title]
YEAR: [year]
TYPE: [MOVIE or SERIES]
CONFIDENCE: [HIGH or MEDIUM or LOW]
REASON: [one to two sentences of visual evidence — explicitly name every actor's face you recognize, even if unsure of the exact title]

If you cannot identify it:
TITLE: UNKNOWN
YEAR: UNKNOWN
TYPE: UNKNOWN
CONFIDENCE: LOW
REASON: [what you see]`;

const PROMPT_MULTI = `You are a movie and TV series identification expert. You are shown several frames captured at different moments from the SAME short video clip.

Use all frames together as evidence — a face, prop, or logo that's clear in one frame can confirm a blurrier moment in another. Identify the exact movie OR TV series this scene is from.

Look for: actor faces, costumes, props, setting, any on-screen text, subtitles, watermarks, logos, cinematography style. If frames look like different unrelated shots, focus on whichever frame gives the strongest, most specific evidence.

Be careful: recognizing an actor's face is not the same as knowing which specific film you're looking at — many actors appear together in more than one project, so don't guess a title just because you recognize the cast. Only use HIGH confidence if you're sure of this exact scene/film. If you recognize the people but are unsure of the specific title, use MEDIUM confidence and say so in REASON, naming the actors you see so it can be checked.

Reply in this EXACT format only:
TITLE: [exact title]
YEAR: [year]
TYPE: [MOVIE or SERIES]
CONFIDENCE: [HIGH or MEDIUM or LOW]
REASON: [one to two sentences of visual evidence — explicitly name every actor's face you recognize, even if unsure of the exact title; mention which frame if relevant]

If you cannot identify it from any frame:
TITLE: UNKNOWN
YEAR: UNKNOWN
TYPE: UNKNOWN
CONFIDENCE: LOW
REASON: [what you see]`;

function buildCorrectionSuffix(correction) {
  if (!correction || !correction.rejectedTitle) return '';
  return `\n\nIMPORTANT — SELF-CORRECTION NEEDED: Your previous answer was "${correction.rejectedTitle}", but that title's real cast is: ${correction.actualCast || 'unknown'}. That does not match the actor(s) you described seeing in the frame(s) (${correction.mentionedActors || 'unclear'}). Your previous guess was therefore WRONG for this scene — do not repeat it. Two actors can appear together in more than one film; think about which OTHER movie or TV series these specific actors/scene actually belong to. If you genuinely cannot determine the correct title, return UNKNOWN rather than repeating the same wrong guess.`;
}

function buildHintSuffix(hint) {
  if (!hint || !String(hint).trim()) return '';
  const clean = String(hint).trim().slice(0, 500);
  return `\n\nVIEWER-PROVIDED DESCRIPTION (optional context, may be vague, partial, or slightly wrong — use it as a helpful clue alongside the visual evidence, not as a fact to accept uncritically): "${clean}"`;
}

function friendlyUpstreamError(rawMsg, status) {
  const msg = (rawMsg || '').toLowerCase();
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many requests')) {
    return "We're getting a lot of traffic right now. Please wait about a minute and try again.";
  }
  if (status === 401 || status === 403) {
    return 'Scene analysis is temporarily unavailable. Please try again shortly.';
  }
  return 'We had trouble analysing that scene. Please try again.';
}

// Helper: simple TMDB search using a query string
async function searchTMDB(query) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_TOKEN}&query=${encodeURIComponent(query)}&include_adult=false`);
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    // Find first result that is a movie or tv show with a title and release_date/first_air_date
    for (const r of results) {
      if (r.media_type === 'movie' || r.media_type === 'tv') {
        const title = r.title || r.name;
        const yearStr = r.release_date || r.first_air_date;
        const year = yearStr ? parseInt(yearStr.substring(0,4),10) : 0;
        const type = r.media_type === 'movie' ? 'MOVIE' : 'SERIES';
        return { title, year, type };
      }
    }
    return null;
  } catch (e) {
    console.error('[TMDB search error]', e);
    return null;
  }
}

// Helper: build a search query from hint and correction data
function buildSearchQuery(hint, correction) {
  const parts = [];
  if (hint && hint.trim()) {
    parts.push(hint.trim());
  }
  // Add actualCast if present (list of actors in the real cast of the rejected title)
  if (correction && correction.actualCast) {
    // actualCast might be a string like "Actor1, Actor2, Actor3"
    const castStr = String(correction.actualCast).trim();
    if (castStr) {
      // split by common separators
      const castArray = castStr.split(/[,&]/).map(s => s.trim()).filter(s => s);
      parts.push(...castArray.slice(0,3)); // limit to first 3 to avoid too long query
    }
  }
  // Add mentionedActors if present (actors user described)
  if (correction && correction.mentionedActors) {
    const mentionedStr = String(correction.mentionedActors).trim();
    if (mentionedStr) {
      const mentionedArray = mentionedStr.split(/[,&]/).map(s => s.trim()).filter(s => s);
      parts.push(...mentionedArray.slice(0,3));
    }
  }
  // Join with space
  return parts.filter(p => p).join(' ');
}

// ── /api/identify ───────────────────────────────────────────
app.post('/api/identify', async (req, res) => {
  try {
    const { imageBuffer, frames, mimeType, correction, hint } = req.body;
    const images = (Array.isArray(frames) && frames.length) ? frames : (imageBuffer ? [imageBuffer] : []);
    if (!images.length) return res.status(400).json({ error: 'No image data provided' });

    const totalKb = Math.round(images.reduce((s, f) => s + f.length, 0) * 0.75 / 1024);
    console.log(`[identify] ${images.length} frame(s), ${totalKb} KB total${correction ? ' [correction pass]' : ''}${hint ? ' [with viewer description]' : ''}`);

    const prompt = (images.length > 1 ? PROMPT_MULTI : PROMPT_SINGLE) + buildCorrectionSuffix(correction) + buildHintSuffix(hint);
    const content = [
      { type: 'text', text: prompt },
      ...images.map(img => ({ type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${img}`, detail: 'high' } }))
    ];

    const gptRes = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GITHUB_TOKEN}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content }],
        max_tokens: 400,
        temperature: 0.1
      })
    });

    const data = await gptRes.json();
    if (!gptRes.ok || !data.choices) {
      console.error('[identify] GPT-4o error:', data.error?.message || gptRes.status);
      return res.status(502).json({ error: friendlyUpstreamError(data.error?.message, gptRes.status) });
    }

    const text = data.choices[0].message.content;
    console.log('[identify] response:', text.slice(0, 150));

    const titleMatch = text.match(/TITLE:\s*([^\n]+)/i);
    const yearMatch  = text.match(/YEAR:\s*(\d{4})/i);
    const typeMatch  = text.match(/TYPE:\s*(MOVIE|SERIES|movie|series)/i);
    const confMatch  = text.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i);
    const reasonMatch = text.match(/REASON:\s*([^\n]+)/i);

    let title = titleMatch?.[1]?.trim().replace(/^["']|["']$/g, '') || '';
    let year  = yearMatch?.[1]?.trim() || '';
    let type  = typeMatch?.[1]?.toUpperCase() === 'SERIES' ? 'SERIES' : 'MOVIE';
    let conf  = confMatch?.[1]?.toUpperCase() || 'MEDIUM';
    const reason = reasonMatch?.[1]?.trim() || '';

    // Determine if we should fallback to TMDB
    const rejectedTitle = correction?.rejectedTitle ? correction.rejectedTitle.trim() : '';
    const needsFallback = (!title || title.toUpperCase() === 'UNKNOWN' || title.toUpperCase() === rejectedTitle.toUpperCase()) && hint && hint.trim();

    if (needsFallback) {
      // Build a richer query: hint + cast info from correction
      const query = buildSearchQuery(hint, correction);
      console.log(`[identify] Triggering TMDB fallback with query: "${query}"`);
      const tmdbResult = await searchTMDB(query);
      if (tmdbResult) {
        title = tmdbResult.title;
        year  = tmdbResult.year;
        type  = tmdbResult.type;
        conf  = 'HIGH';
        console.log('[identify] Using TMDB fallback result:', {title, year, type});
        return res.json({ title, year, type, confidence: conf, reason: `Matched hint via TMDB: "${query}"` });
      }
      // fallback failed – continue with original result (may be UNKNOWN)
    }

    if (!title || title.toUpperCase() === 'UNKNOWN') {
      console.log('[identify] UNKNOWN — low confidence frame');
      return res.status(200).json({ title: 'UNKNOWN', year: 0, type: 'MOVIE' });
    }

    if (conf === 'LOW') {
      console.log('[identify] LOW confidence — skipping frame');
      return res.status(200).json({ title: 'UNKNOWN', year: 0, type: 'MOVIE' });
    }

    console.log(`[identify] ✅ "${title}" (${year}) [${type}] [${conf}]`);
    res.json({ title, year: parseInt(year) || year, type, confidence: conf, reason });

  } catch (err) {
    console.error('[identify] exception:', err.message);
    res.status(500).json({ error: 'We had trouble analysing that scene. Please try again.' });
  }
});

// ── /api/tmdb ───────────────────────────────────────────────
app.get('/api/tmdb', async (req, res) => {
  try {
    const { path } = req.query;
    const response = await fetch(`https://api.themoviedb.org/3${path}`, {
      headers: { 'Authorization': `Bearer ${TMDB_TOKEN}`, 'accept': 'application/json' }
    });
    res.json(await response.json());
  } catch (error) {
    res.status(500).json({ error: 'TMDB proxy failed' });
  }
});

// ── /api/watchmode/search ───────────────────────────────────
app.get('/api/watchmode/search', async (req, res) => {
  try {
    const { imdb_id, title } = req.query;
    const url = imdb_id
      ? `https://api.watchmode.com/v1/search/?apiKey=${WATCHMODE_KEY}&search_field=imdb_id&search_value=${imdb_id}`
      : `https://api.watchmode.com/v1/search/?apiKey=${WATCHMODE_KEY}&search_field=name&search_value=${encodeURIComponent(title)}`;
    const resp = await fetch(url);
    res.json(await resp.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── /api/watchmode/sources/:id ──────────────────────────────
app.get('/api/watchmode/sources/:id', async (req, res) => {
  try {
    const url = `https://api.watchmode.com/v1/title/${req.params.id}/sources/?apiKey=${WATCHMODE_KEY}`;
    const resp = await fetch(url);
    res.json(await resp.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── /api/watchmode (legacy) ─────────────────────────────────
app.get('/api/watchmode', async (req, res) => {
  try {
    const { query } = req.query;
    const url = `https://api.watchmode.com/v1/search/?apiKey=${WATCHMODE_KEY}&search_field=title&search_value=${encodeURIComponent(query)}`;
    const resp = await fetch(url);
    res.json(await resp.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export const handler = serverless(app);