import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN;
const WATCHMODE_KEY = process.env.WATCHMODE_API_KEY;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  const blocked = ['.env', '.git', 'package.json', 'server.js', 'node_modules'];
  if (blocked.some(b => req.path.includes(b))) return res.status(403).end();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

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

/* When the client already tried a title and found the actual cast doesn't
   match the actors visible in the frame(s), it resends the same frames
   with this extra context so the model doesn't just repeat its mistake. */
function buildCorrectionSuffix(correction) {
  if (!correction || !correction.rejectedTitle) return '';
  return `\n\nIMPORTANT — SELF-CORRECTION NEEDED: Your previous answer was "${correction.rejectedTitle}", but that title's real cast is: ${correction.actualCast || 'unknown'}. That does not match the actor(s) you described seeing in the frame(s) (${correction.mentionedActors || 'unclear'}). Your previous guess was therefore WRONG for this scene — do not repeat it. Two actors can appear together in more than one film; think about which OTHER movie or TV series these specific actors/scene actually belong to. If you genuinely cannot determine the correct title, return UNKNOWN rather than repeating the same wrong guess.`;
}

/* Optional free-text description the user typed in ("a music teacher
   scolding a student", "it's a Nigerian drama", etc). Treated as a hint,
   not ground truth — the model should weigh it against what it can
   actually see rather than accept it uncritically. */
function buildHintSuffix(hint) {
  if (!hint || !String(hint).trim()) return '';
  const clean = String(hint).trim().slice(0, 500);
  return `\n\nVIEWER-PROVIDED DESCRIPTION (optional context, may be vague, partial, or slightly wrong — use it as a helpful clue alongside the visual evidence, not as a fact to accept uncritically): "${clean}"`;
}

/* Turns whatever the upstream vision API says into a short, calm, non-
   technical message. We deliberately never pass through the vendor name,
   model name, or rate-limit internals — that's implementation detail the
   user doesn't need and shouldn't see. */
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

// ── /api/identify ───────────────────────────────────────────
app.post('/api/identify', async (req, res) => {
  try {
    // Accept either a single `imageBuffer` (legacy) or an array of `frames`
    // (preferred — lets the model cross-reference multiple video moments
    // in one request instead of us looping call-by-call).
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
        // 250 was clipping REASON mid-sentence on frames with two+ actors,
        // which silently broke the cast cross-check downstream (it only
        // saw the first actor named, so "right actors, wrong movie"
        // mix-ups slipped through). Give it enough room to finish.
        max_tokens: 400,
        temperature: 0.1
      })
    });

    const data = await gptRes.json();
    if (!gptRes.ok || !data.choices) {
      // Log the real upstream error for us, but never forward vendor/model
      // details or rate-limit internals to the client — the user doesn't
      // need to know we're calling GPT-4o via GitHub Models, and a raw
      // "Rate limit of 40000 per 60s exceeded for UserByModelByMinuteTokens"
      // message is both scary and none of their business.
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

    const title = titleMatch?.[1]?.trim().replace(/^["']|["']$/g, '') || '';
    const year  = yearMatch?.[1]?.trim() || '';
    const type  = typeMatch?.[1]?.toUpperCase() === 'SERIES' ? 'SERIES' : 'MOVIE';
    const conf  = confMatch?.[1]?.toUpperCase() || 'MEDIUM';
    const reason = reasonMatch?.[1]?.trim() || '';

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
    const { path: tmdbPath } = req.query;
    const r = await fetch(`https://api.themoviedb.org/3${tmdbPath}`, {
      headers: { 'Authorization': `Bearer ${TMDB_TOKEN}`, 'accept': 'application/json' }
    });
    res.json(await r.json());
  } catch (err) {
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
    res.json(await (await fetch(url)).json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── /api/watchmode/sources/:id ──────────────────────────────
app.get('/api/watchmode/sources/:id', async (req, res) => {
  try {
    const url = `https://api.watchmode.com/v1/title/${req.params.id}/sources/?apiKey=${WATCHMODE_KEY}`;
    res.json(await (await fetch(url)).json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── /api/watchmode (legacy) ─────────────────────────────────
app.get('/api/watchmode', async (req, res) => {
  try {
    const { query } = req.query;
    const url = `https://api.watchmode.com/v1/search/?apiKey=${WATCHMODE_KEY}&search_field=title&search_value=${encodeURIComponent(query)}`;
    res.json(await (await fetch(url)).json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Static files ────────────────────────────────────────────
app.use(express.static(__dirname, { dotfiles: 'ignore' }));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Export the app for serverless platforms (Vercel) via serverless-http.
// The `listen` call below only runs when started directly with `node server.js`
// (local dev) — it is skipped when the module is imported by api/index.js.
export const handler = null; // placeholder; real handler is built in api/index.js
export default app;
export { app };

// Only start the local HTTP server when run directly (not when imported).
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  app.listen(PORT, () => {
    console.log(`Movie Finder running at http://localhost:${PORT}`);
    console.log(`GPT-4o: ${GITHUB_TOKEN ? '✅' : '❌ MISSING'}`);
  });
}
