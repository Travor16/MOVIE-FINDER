/* =========================================================
   MOVIE FINDER UG - FULL FRONTEND ROUTING CODE
   ========================================================= */

const _F = 'https://image.tmdb.org/t/p/w500';

/* ── Streaming platform logos ── */
const PLATFORM_LOGOS = {
  'Netflix':        'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg',
  'Amazon Prime':   'https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg',
  'Disney+':        'https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg',
  'Apple TV+':      'https://upload.wikimedia.org/wikipedia/commons/2/28/Apple_TV_Plus_Logo.svg',
  'Max':            'https://upload.wikimedia.org/wikipedia/commons/1/17/HBO_Max_Logo.svg',
  'Hulu':           'https://upload.wikimedia.org/wikipedia/commons/e/e4/Hulu_Logo.svg',
  'Showmax':        'https://upload.wikimedia.org/wikipedia/commons/5/5e/Showmax_logo.svg',
  'YouTube':        'https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg',
  'Google Play':    'https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg',
  'Tubi':           'https://upload.wikimedia.org/wikipedia/commons/f/f7/Tubi_logo_2019.svg',
  'Peacock':        'https://upload.wikimedia.org/wikipedia/commons/d/d3/NBCUniversal_Peacock_Logo.svg',
  'Paramount+':     'https://upload.wikimedia.org/wikipedia/commons/a/a5/Paramount_Plus.svg',
};

/* =========================================================
   STEP 1 — AI VISION
   ========================================================= */
async function identifyWithAI(file) {
  const base64 = await fileToBase64(file);

  const prompt = 'Identify the exact movie or TV series from this scene. Reply in this format:\n' +
    'TITLE: [exact title]\nYEAR: [year]\nTYPE: [MOVIE or SERIES]\nCONFIDENCE: [HIGH/MEDIUM/LOW]\nREASON: [visual evidence]';

  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
  };

  let res;
  try {
    res = await fetch('/api/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Network error: Unable to reach analysis server.');
  }

  const raw = await res.text();
  if (!res.ok) {
    let errorMsg = 'Scene analysis failed.';
    try { errorMsg = JSON.parse(raw).error?.message || errorMsg; } catch(e) {}
    throw new Error(errorMsg);
  }

  try {
    const data = JSON.parse(raw);
    return {
      title: data.searchQuery || 'UNKNOWN',
      year: data.releaseYear || 'UNKNOWN',
      type: data.mediaType === 'tv' ? 'SERIES' : 'MOVIE',
      confidence: 'HIGH', 
      reason: 'Verified via search engine.'
    };
  } catch (e) {
    throw new Error('Failed to process server response.');
  }
}

/* =========================================================
   STEP 2 — DATABASE & HELPERS
   ========================================================= */
async function dbFetch(path) {
  const r = await fetch('/api/tmdb?path=' + encodeURIComponent(path));
  if (!r.ok) throw new Error('Database search failed.');
  return r.json();
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith('video/')) return captureVideoFrame(file).then(resolve).catch(reject);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const MAX = 1024;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function captureVideoFrame(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.src = url; video.muted = true;
    video.addEventListener('loadeddata', () => { video.currentTime = Math.min(video.duration * 0.3, 5); });
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    });
    video.addEventListener('error', reject);
  });
}

async function searchDatabase(title, year, type) {
  const q = encodeURIComponent(title);
  const yr = (year && year !== 'UNKNOWN') ? year : '';
  const [mData, tvData] = await Promise.all([
    dbFetch('/search/movie?query=' + q + '&language=en-US&page=1' + (yr ? '&year=' + yr : '')),
    dbFetch('/search/tv?query=' + q + '&language=en-US&page=1' + (yr ? '&first_air_date_year=' + yr : ''))
  ]);
  const lower = title.toLowerCase();
  function score(r, field) {
    const t = (r[field] || '').toLowerCase();
    let s = r.popularity || 0;
    if (t === lower) s += 10000;
    else if (t.startsWith(lower)) s += 5000;
    else if (t.includes(lower)) s += 2000;
    return s;
  }
  const movies = (mData.results || []).map(r => ({ ...r, _type: 'movie', _score: score(r, 'title') }));
  const shows = (tvData.results || []).map(r => ({ ...r, _type: 'tv', _score: score(r, 'name') }));
  if (type && type.toUpperCase() === 'SERIES') shows.forEach(s => { s._score += 3000; });
  if (type && type.toUpperCase() === 'MOVIE') movies.forEach(m => { m._score += 3000; });
  const all = [...movies, ...shows].sort((a, b) => b._score - a._score);
  if (!all.length) {
    const multi = await dbFetch('/search/multi?query=' + q + '&language=en-US&page=1');
    const valid = (multi.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
    if (!valid.length) return null;
    return valid[0].media_type === 'tv' ? getTVDetails(valid[0].id) : getMovieDetails(valid[0].id);
  }
  const best = all[0];
  return best._type === 'tv' ? getTVDetails(best.id) : getMovieDetails(best.id);
}

async function getMovieDetails(id) {
  const [detail, videos, credits] = await Promise.all([
    dbFetch('/movie/' + id + '?language=en-US'),
    dbFetch('/movie/' + id + '/videos?language=en-US'),
    dbFetch('/movie/' + id + '/credits?language=en-US'),
  ]);
  const videoList = videos.results || [];
  let trailer = videoList.find(v => v.type === 'Trailer' && v.site === 'YouTube' && (v.name || '').toLowerCase().includes('official')) || videoList.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videoList.find(v => v.site === 'YouTube');
  const director = (credits.crew || []).find(c => c.job === 'Director');
  const cast = (credits.cast || []).slice(0, 6).map(a => a.name).join(', ');
  return {
    id: detail.id, imdbId: detail.imdb_id || '', title: detail.title, mediaType: 'Movie',
    year: (detail.release_date || '').split('-')[0], genre: (detail.genres || []).map(g => g.name).join(', '),
    runtime: detail.runtime ? detail.runtime + ' min' : '', overview: detail.overview, tagline: detail.tagline || '',
    poster: detail.poster_path ? _F + detail.poster_path : '', rating: detail.vote_average ? ('&#11088; ' + detail.vote_average.toFixed(1) + '/10 (' + (detail.vote_count || 0).toLocaleString() + ' votes)') : '',
    trailerKey: trailer ? trailer.key : '', director: director ? director.name : 'N/A', cast: cast || 'N/A',
    seasons: null, episodes: null
  };
}

async function getTVDetails(id) {
  const [detail, videos, credits] = await Promise.all([
    dbFetch('/tv/' + id + '?language=en-US'),
    dbFetch('/tv/' + id + '/videos?language=en-US'),
    dbFetch('/tv/' + id + '/credits?language=en-US'),
  ]);
  const videoList = videos.results || [];
  let trailer = videoList.find(v => v.type === 'Trailer' && v.site === 'YouTube' && (v.name || '').toLowerCase().includes('official')) || videoList.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videoList.find(v => v.site === 'YouTube');
  const creators = (detail.created_by || []).map(c => c.name).join(', ') || 'N/A';
  const cast = (credits.cast || []).slice(0, 6).map(a => a.name).join(', ');
  let imdbId = '';
  try { const ext = await dbFetch('/tv/' + id + '/external_ids'); imdbId = ext.imdb_id || ''; } catch(e) {}
  return {
    id: detail.id, imdbId: imdbId, title: detail.name, mediaType: 'TV Series',
    year: (detail.first_air_date || '').split('-')[0], genre: (detail.genres || []).map(g => g.name).join(', '),
    runtime: detail.episode_run_time?.[0] ? detail.episode_run_time[0] + ' min/ep' : '',
    overview: detail.overview, tagline: detail.tagline || '', poster: detail.poster_path ? _F + detail.poster_path : '',
    rating: detail.vote_average ? ('&#11088; ' + detail.vote_average.toFixed(1) + '/10 (' + (detail.vote_count || 0).toLocaleString() + ' votes)') : '',
    trailerKey: trailer ? trailer.key : '', director: creators, cast: cast || 'N/A',
    seasons: detail.number_of_seasons || null, episodes: detail.number_of_episodes || null
  };
}

/* =========================================================
   STEP 3 — STREAMING LINKS
   ========================================================= */
async function getStreamingLinks(imdbId, title) {
  try {
    const searchUrl = imdbId ? '/api/watchmode/search?imdb_id=' + imdbId : '/api/watchmode/search?title=' + encodeURIComponent(title);
    const sRes = await fetch(searchUrl);
    if (!sRes.ok) return [];
    const sData = await sRes.json();
    const found = sData.title_results?.[0];
    if (!found) return [];
    const srcRes = await fetch('/api/watchmode/sources/' + found.id);
    if (!srcRes.ok) return [];
    const sources = await srcRes.json();
    const seen = new Map();
    const priority = { sub: 1, free: 2, rent: 3, buy: 4 };
    for (const s of sources) {
      if (!s.name || !s.web_url) continue;
      const ex = seen.get(s.name);
      if (!ex || (priority[s.type] || 9) < (priority[ex.type] || 9)) seen.set(s.name, s);
    }
    return Array.from(seen.values()).slice(0, 12);
  } catch (e) { return []; }
}

async function getSimilar(id, mediaType) {
  const type = mediaType === 'TV Series' ? 'tv' : 'movie';
  const data = await dbFetch('/' + type + '/' + id + '/similar?language=en-US&page=1');
  return (data.results || []).slice(0, 8).map(r => ({ id: r.id, title: r.title || r.name, year: ((r.release_date || r.first_air_date || '')).split('-')[0], poster: r.poster_path ? _F + r.poster_path : '', type: type }));
}

/* =========================================================
   MAIN ORCHESTRATOR
   ========================================================= */
async function runFullSearch(file) {
  setStep(1, 'Analysing your scene');
  animateProgress(0, 30, 1200);
  const aiResult = await identifyWithAI(file);
  if (!aiResult.title || aiResult.title === 'UNKNOWN') throw new Error('We could not identify this scene.');
  setStep(2, 'Found: "' + aiResult.title + '" — loading details');
  animateProgress(30, 65, 800);
  const media = await searchDatabase(aiResult.title, aiResult.year, aiResult.type);
  if (!media) throw new Error('Could not load details.');
  setStep(3, 'Finding where to watch');
  animateProgress(65, 90, 700);
  const sources = await getStreamingLinks(media.imdbId, media.title);
  animateProgress(90, 100, 300);
  await sleep(200);
  const similar = await getSimilar(media.id, media.mediaType).catch(() => []);
  return { media, sources, aiResult, similar };
}

async function runNameSearch(query) {
  setStep(1, 'Searching for "' + query + '"');
  animateProgress(0, 40, 600);
  const media = await searchDatabase(query, null, null);
  if (!media) throw new Error('Nothing found for "' + query + '".');
  setStep(2, 'Loading details');
  animateProgress(40, 70, 500);
  const sources = await getStreamingLinks(media.imdbId, media.title);
  animateProgress(70, 100, 400);
  await sleep(200);
  const similar = await getSimilar(media.id, media.mediaType).catch(() => []);
  return { media, sources, aiResult: null, similar };
}

/* UI Logic (Event Listeners, Renderers, Helpers) remain the same */