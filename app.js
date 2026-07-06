/* =========================================================
   MOVIE FINDER UG - FRONTEND ROUTING CODE
   ========================================================= */

const _F = 'https://image.tmdb.org/t/p/w500';

/* ── Streaming platform logos ── */
const PLATFORM_LOGOS = {
  'Netflix':      'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg',
  'Amazon Prime': 'https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg',
  'Disney+':      'https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg',
  'Apple TV+':    'https://upload.wikimedia.org/wikipedia/commons/2/28/Apple_TV_Plus_Logo.svg',
  'Max':          'https://upload.wikimedia.org/wikipedia/commons/1/17/HBO_Max_Logo.svg',
  'Hulu':         'https://upload.wikimedia.org/wikipedia/commons/e/e4/Hulu_Logo.svg',
  'Showmax':      'https://upload.wikimedia.org/wikipedia/commons/5/5e/Showmax_logo.svg',
  'YouTube':      'https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg',
  'Google Play':  'https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg',
  'Tubi':         'https://upload.wikimedia.org/wikipedia/commons/f/f7/Tubi_logo_2019.svg',
  'Peacock':      'https://upload.wikimedia.org/wikipedia/commons/d/d3/NBCUniversal_Peacock_Logo.svg',
  'Paramount+':   'https://upload.wikimedia.org/wikipedia/commons/a/a5/Paramount_Plus.svg',
};

/* ── VJ platforms for Uganda ── */
const VJ_PLATFORMS = [
  { name: 'Best Movies UG',  logo: 'https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg', url: 'https://play.google.com/store/search?q=', suffix: '+best+movies+ug', region: 'Uganda' },
  { name: 'YouTube VJ',      logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg',          url: 'https://www.youtube.com/results?search_query=', suffix: '+vj+narrator+uganda', region: 'Uganda / EA' },
  { name: 'Telegram VJ',     logo: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',             url: 'https://www.google.com/search?q=telegram+', suffix: '+vj+movie+uganda', region: 'East Africa' },
  { name: 'Ronnie VJ',       logo: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',             url: 'https://t.me/s/ronnie_vj_movie_', suffix: '', region: 'Uganda' },
  { name: 'WhatsApp Groups', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',                  url: 'https://www.google.com/search?q=whatsapp+', suffix: '+vj+movie+group+uganda', region: 'Uganda' },
  { name: 'TikTok VJ Clips', logo: 'https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg',                   url: 'https://www.tiktok.com/search?q=', suffix: '+vj+uganda', region: 'Uganda' },
];

/* =========================================================
   STEP 1 — AI VISION: identify title from image/video frame
   ========================================================= */
async function identifyWithAI(file) {
  const base64 = await fileToBase64(file);

  const prompt = 'You are a movie and TV series identification expert. Look at this image carefully.\n\n' +
    'Identify the exact movie OR TV series this scene is from.\n\n' +
    'Look for: actor faces, costumes, props, setting, any on-screen text, subtitles, watermarks, logos, cinematography style.\n\n' +
    'Reply in this EXACT format only:\n' +
    'TITLE: [exact title]\n' +
    'YEAR: [year]\n' +
    'TYPE: [MOVIE or SERIES]\n' +
    'CONFIDENCE: [HIGH or MEDIUM or LOW]\n' +
    'REASON: [one sentence of visual evidence]\n\n' +
    'If you cannot identify it:\n' +
    'TITLE: UNKNOWN\nYEAR: UNKNOWN\nTYPE: UNKNOWN\nCONFIDENCE: LOW\nREASON: [what you see]';

  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
  };

  let res;
  try {
    // UPDATED: Routes directly to your Netlify serverless execution environment
    res = await fetch('/.netlify/functions/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Network deployment error. Serverless endpoint is unreachable.');
  }

  const raw = await res.text();
  if (!res.ok) {
    let msg = 'Error ' + res.status;
    try { msg = JSON.parse(raw).error?.message || msg; } catch(e) {}
    throw new Error('Scene analysis failed: ' + msg);
  }

  const data = JSON.parse(raw);
  const candidate = data.candidates?.[0];
  if (!candidate || candidate.finishReason === 'SAFETY') {
    throw new Error('This image could not be analysed. Try a different screenshot.');
  }
  const text = candidate.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('No result. Please try again.');

  const lines = text.trim().split('\n');
  const get = (key) => {
    const line = lines.find(l => l.toUpperCase().startsWith(key + ':'));
    return line ? line.split(':').slice(1).join(':').trim() : '';
  };
  return {
    title:      get('TITLE'),
    year:       get('YEAR'),
    type:       get('TYPE'),
    confidence: get('CONFIDENCE'),
    reason:     get('REASON'),
  };
}

/* Convert file to compressed base64 JPEG */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith('video/')) { captureVideoFrame(file).then(resolve).catch(reject); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1024;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
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
    const canvas = document.createElement('canvas');
    const url = URL.createObjectURL(file);
    video.src = url; video.muted = true;
    video.addEventListener('loadeddata', () => { video.currentTime = Math.min(video.duration * 0.3, 5); });
    video.addEventListener('seeked', () => {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    });
    video.addEventListener('error', reject);
  });
}

/* =========================================================
   STEP 2 — DATABASE: search movies AND TV series
   ========================================================= */
async function dbFetch(path) {
  // UPDATED: Routes through Netlify function middleware to keep API credentials secure
  const r = await fetch('/.netlify/functions/tmdb?path=' + encodeURIComponent(path));
  if (!r.ok) throw new Error('Search failed. Please try again.');
  return r.json();
}

async function searchDatabase(title, year, type) {
  const q = encodeURIComponent(title);
  const yr = (year && year !== 'UNKNOWN') ? year : '';

  /* Search movies and TV in parallel */
  const [mData, tvData] = await Promise.all([
    dbFetch('/search/movie?query=' + q + '&language=en-US&page=1' + (yr ? '&year=' + yr : '')),
    dbFetch('/search/tv?query='    + q + '&language=en-US&page=1' + (yr ? '&first_air_date_year=' + yr : ''))
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

  const movies = (mData.results  || []).map(r => ({ ...r, _type: 'movie', _score: score(r, 'title') }));
  const shows  = (tvData.results || []).map(r => ({ ...r, _type: 'tv',    _score: score(r, 'name')  }));

  /* If Gemini said SERIES, boost TV results */
  if (type && type.toUpperCase() === 'SERIES') {
    shows.forEach(s => { s._score += 3000; });
  }
  /* If Gemini said MOVIE, boost movie results */
  if (type && type.toUpperCase() === 'MOVIE') {
    movies.forEach(m => { m._score += 3000; });
  }

  const all = [...movies, ...shows].sort((a, b) => b._score - a._score);

  if (!all.length) {
    /* Fallback: multi-search */
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
  const trailer  = (videos.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube') || (videos.results || []).find(v => v.site === 'YouTube');
  const director = (credits.crew   || []).find(c => c.job === 'Director');
  const cast     = (credits.cast   || []).slice(0, 6).map(a => a.name).join(', ');
  return {
    id: detail.id, imdbId: detail.imdb_id || '',
    title: detail.title, mediaType: 'Movie',
    year: (detail.release_date || '').split('-')[0],
    genre: (detail.genres || []).map(g => g.name).join(', '),
    runtime: detail.runtime ? detail.runtime + ' min' : '',
    overview: detail.overview, tagline: detail.tagline || '',
    poster: detail.poster_path ? _F + detail.poster_path : '',
    rating: detail.vote_average ? ('&#11088; ' + detail.vote_average.toFixed(1) + '/10  (' + (detail.vote_count || 0).toLocaleString() + ' votes)') : '',
    trailerKey: trailer ? trailer.key : '',
    director: director ? director.name : 'N/A', cast: cast || 'N/A',
    seasons: null, episodes: null,
  };
}

async function getTVDetails(id) {
  const [detail, videos, credits] = await Promise.all([
    dbFetch('/tv/' + id + '?language=en-US'),
    dbFetch('/tv/' + id + '/videos?language=en-US'),
    dbFetch('/tv/' + id + '/credits?language=en-US'),
  ]);
  const trailer  = (videos.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube') || (videos.results || []).find(v => v.site === 'YouTube');
  const creators = (detail.created_by || []).map(c => c.name).join(', ') || 'N/A';
  const cast     = (credits.cast || []).slice(0, 6).map(a => a.name).join(', ');
  let imdbId = '';
  try { const ext = await dbFetch('/tv/' + id + '/external_ids'); imdbId = ext.imdb_id || ''; } catch(e) {}
  return {
    id: detail.id, imdbId: imdbId,
    title: detail.name, mediaType: 'TV Series',
    year: (detail.first_air_date || '').split('-')[0],
    genre: (detail.genres || []).map(g => g.name).join(', '),
    runtime: detail.episode_run_time?.[0] ? detail.episode_run_time[0] + ' min/ep' : '',
    overview: detail.overview, tagline: detail.tagline || '',
    poster: detail.poster_path ? _F + detail.poster_path : '',
    rating: detail.vote_average ? ('&#11088; ' + detail.vote_average.toFixed(1) + '/10  (' + (detail.vote_count || 0).toLocaleString() + ' votes)') : '',
    trailerKey: trailer ? trailer.key : '',
    director: creators, cast: cast || 'N/A',
    seasons: detail.number_of_seasons || null,
    episodes: detail.number_of_episodes || null,
  };
}

/* =========================================================
   STEP 3 — STREAMING LINKS via Watchmode
   ========================================================= */
async function getStreamingLinks(imdbId, title) {
  try {
    const searchUrl = imdbId
      ? '/.netlify/functions/watchmode?imdb_id=' + imdbId
      : '/.netlify/functions/watchmode?title=' + encodeURIComponent(title);

    const sRes = await fetch(searchUrl);
    if (!sRes.ok) return [];
    const sData = await sRes.json();
    const found = sData.title_results?.[0];
    if (!found) return [];

    const srcRes = await fetch('/.netlify/functions/watchmode?source_id=' + found.id);
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
  } catch (e) {
    return [];
  }
}

/* =========================================================
   SIMILAR TITLES
   ========================================================= */
async function getSimilar(id, mediaType) {
  const type = mediaType === 'TV Series' ? 'tv' : 'movie';
  const data  = await dbFetch('/' + type + '/' + id + '/similar?language=en-US&page=1');
  return (data.results || []).slice(0, 8).map(r => ({
    id:     r.id,
    title:  r.title || r.name,
    year:   ((r.release_date || r.first_air_date || '')).split('-')[0],
    poster: r.poster_path ? _F + r.poster_path : '',
    type:   type,
  }));
}

/* =========================================================
   MAIN ORCHESTRATOR
   ========================================================= */
async function runFullSearch(file) {
  setStep(1, 'Analysing your scene');
  animateProgress(0, 30, 1200);

  const aiResult = await identifyWithAI(file);

  if (!aiResult.title || aiResult.title === 'UNKNOWN') {
    throw new Error('We could not identify this scene. Try a clearer screenshot or use the text search below.');
  }

  setStep(2, 'Found: "' + aiResult.title + '" — loading details');
  animateProgress(30, 65, 800);

  const media = await searchDatabase(aiResult.title, aiResult.year, aiResult.type);
  if (!media) throw new Error('We found the title but could not load its details. Try the text search below.');

  setStep(3, 'Finding where to watch worldwide');
  animateProgress(65, 90, 700);

  const sources = await getStreamingLinks(media.imdbId, media.title);
  animateProgress(90, 100, 300);
  await sleep(200);

  /* Fetch similar titles in background */
  const similar = await getSimilar(media.id, media.mediaType).catch(() => []);

  return { media, sources, aiResult, similar };
}

async function runNameSearch(query) {
  setStep(1, 'Searching for "' + query + '"');
  animateProgress(0, 40, 600);

  const media = await searchDatabase(query, null, null);
  if (!media) throw new Error('Nothing found for "' + query + '". Try a different spelling or add the year.');

  setStep(2, 'Loading details');
  animateProgress(40, 70, 500);

  const sources = await getStreamingLinks(media.imdbId, media.title);
  animateProgress(70, 100, 400);
  await sleep(200);

  const similar = await getSimilar(media.id, media.mediaType).catch(() => []);

  return { media, sources, aiResult: null, similar };
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */
document.getElementById('findBtn').addEventListener('click', async () => {
  if (!window._file) return;
  showLoading();
  try { showResults(await runFullSearch(window._file)); }
  catch (err) { showError(err.message); }
});

document.getElementById('nameSearchBtn').addEventListener('click', async () => {
  const q = document.getElementById('movieNameInput').value.trim();
  if (!q) { document.getElementById('movieNameInput').focus(); return; }
  showLoading();
  try { showResults(await runNameSearch(q)); }
  catch (err) { showError(err.message); }
});

document.getElementById('movieNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('nameSearchBtn').click();
});

/* Quick search tags */
window.quickSearch = function(title) {
  document.getElementById('movieNameInput').value = title;
  document.getElementById('nameSearchBtn').click();
};

/* =========================================================
   UPLOAD / DRAG & DROP
   ========================================================= */
(function initUpload() {
  const zone  = document.getElementById('uploadZone');
  const inner = document.getElementById('uploadInner');
  const inp   = document.getElementById('fileInput');
  const prev  = document.getElementById('uploadPreview');
  const pImg  = document.getElementById('previewImg');
  const pVid  = document.getElementById('previewVideo');
  const rm    = document.getElementById('removeFile');
  const fb    = document.getElementById('findBtn');

  window.showPreview = function(file) {
    const url = URL.createObjectURL(file);
    inner.classList.add('hidden'); prev.classList.remove('hidden');
    if (file.type.startsWith('image/')) {
      pImg.src = url; pImg.classList.remove('hidden'); pVid.classList.add('hidden');
    } else {
      pVid.src = url; pVid.classList.remove('hidden'); pImg.classList.add('hidden');
    }
    fb.disabled = false; window._file = file;
  };

  window.clearUpload = function() {
    prev.classList.add('hidden'); inner.classList.remove('hidden');
    pImg.src = ''; pVid.src = ''; inp.value = '';
    fb.disabled = true; window._file = null;
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('loadingState').classList.add('hidden');
  };

  inp.onchange = e => { if (e.target.files[0]) window.showPreview(e.target.files[0]); };
  rm.onclick   = window.clearUpload;
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && (f.type.startsWith('image/') || f.type.startsWith('video/'))) window.showPreview(f);
  });
})();

/* =========================================================
   RENDER RESULTS
   ========================================================= */
function showResults({ media, sources, aiResult, similar }) {
  hideLoading();
  const section = document.getElementById('resultsSection');

  const confBadge = aiResult && aiResult.confidence
    ? '<span class="confidence-badge conf-' + aiResult.confidence.toLowerCase() + '">' + aiResult.confidence + ' CONFIDENCE</span>'
    : '';

  const imdbLink = media.imdbId
    ? '<a href="https://www.imdb.com/title/' + media.imdbId + '/" target="_blank" rel="noopener" class="imdb-link"><i class="fas fa-external-link-alt"></i> IMDb Page</a>'
    : '';

  const metaSeasons  = media.seasons  ? '<span><i class="fas fa-layer-group"></i> ' + media.seasons  + ' Season'  + (media.seasons  > 1 ? 's' : '') + '</span>' : '';
  const metaEpisodes = media.episodes ? '<span><i class="fas fa-list"></i> '          + media.episodes + ' Episodes</span>' : '';
  const dirLabel     = media.mediaType === 'TV Series' ? 'Creator' : 'Director';

  section.innerHTML =
    '<div class="match-header">' +
      '<div class="match-badge"><i class="fas fa-check-circle"></i> Match Found</div>' +
      confBadge +
    '</div>' +
    (aiResult && aiResult.reason ? '<p class="ai-reason"><i class="fas fa-eye"></i> ' + aiResult.reason + '</p>' : '') +

    '<div class="result-card">' +
      '<div class="result-poster">' +
        (media.poster ? '<img src="' + media.poster + '" alt="' + media.title + ' poster"/>' : '') +
        (media.rating ? '<div class="result-rating">' + media.rating + '</div>' : '') +
      '</div>' +
      '<div class="result-info">' +
        '<h2>' + media.title + '</h2>' +
        '<div class="media-type-badge ' + (media.mediaType === 'TV Series' ? 'badge-tv' : 'badge-movie') + '">' +
          '<i class="fas fa-' + (media.mediaType === 'TV Series' ? 'tv' : 'film') + '"></i> ' + media.mediaType +
        '</div>' +
        (media.tagline ? '<p class="result-tagline">"' + media.tagline + '"</p>' : '') +
        '<div class="result-meta">' +
          (media.year    ? '<span><i class="fas fa-calendar-alt"></i> ' + media.year    + '</span>' : '') +
          (media.genre   ? '<span><i class="fas fa-tag"></i> '           + media.genre   + '</span>' : '') +
          (media.runtime ? '<span><i class="fas fa-clock"></i> '         + media.runtime + '</span>' : '') +
          metaSeasons + metaEpisodes +
        '</div>' +
        '<p class="result-overview">' + (media.overview || '') + '</p>' +
        '<div class="result-detail"><strong>' + dirLabel + ':</strong> ' + media.director + '</div>' +
        '<div class="result-detail"><strong>Cast:</strong> ' + media.cast + '</div>' +
        (imdbLink ? '<div class="result-detail">' + imdbLink + '</div>' : '') +
      '</div>' +
    '</div>' +

    (media.trailerKey ?
      '<div class="trailer-box">' +
        '<h3><i class="fas fa-play-circle"></i> Official Trailer</h3>' +
        '<div class="trailer-frame">' +
          '<iframe src="https://www.youtube.com/embed/' + media.trailerKey + '?rel=0&modestbranding=1" allowfullscreen title="Trailer" loading="lazy"></iframe>' +
        '</div>' +
      '</div>'
    : '') +

    '<div class="streaming-section">' +
      '<h3><i class="fas fa-globe"></i> Where to Watch</h3>' +
      '<div class="streaming-tabs">' +
        '<button class="stream-tab active" data-tab="normal">Normal Version</button>' +
        '<button class="stream-tab" data-tab="vj">&#127482;&#127468; VJ Uganda Style</button>' +
      '</div>' +
      '<div class="stream-tab-content active" id="sTab-normal">' + buildNormalGrid(sources, media.title) + '</div>' +
      '<div class="stream-tab-content" id="sTab-vj">' +
        '<div class="vj-notice"><i class="fas fa-microphone"></i>' +
          '<p>VJ (Video Joker) versions have a Ugandan narrator dubbed over the film. Search the links below for <strong>"' + media.title + ' VJ"</strong>.</p>' +
        '</div>' +
        buildVJGrid(media.title) +
      '</div>' +
    '</div>' +

    '<button class="btn-reset" onclick="window.clearUpload()"><i class="fas fa-redo"></i> Search Another</button>';

  /* Similar movies block */
  if (similar && similar.length > 0) {
    const cards = similar.filter(s => s.poster).map(s =>
      '<div class="similar-card" onclick="window.quickSearch(\'' + s.title.replace(/'/g, "\\'") + '\')" title="' + s.title + '">' +
      '<img src="' + s.poster + '" alt="' + s.title + '" loading="lazy"/>' +
      '<div class="similar-card-info">' +
        '<div class="similar-card-title">' + s.title + '</div>' +
        '<div class="similar-card-year">' + (s.year || '') + '</div>' +
      '</div></div>'
    ).join('');

    section.innerHTML +=
      '<div class="similar-section">' +
        '<h3><i class="fas fa-th-large"></i> You Might Also Like</h3>' +
        '<div class="similar-grid">' + cards + '</div>' +
      '</div>';
  }

  /* Wire tabs */
  section.querySelectorAll('.stream-tab').forEach(tab => {
    tab.onclick = () => {
      section.querySelectorAll('.stream-tab').forEach(t => t.classList.remove('active'));
      section.querySelectorAll('.stream-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      section.querySelector('#sTab-' + tab.dataset.tab).classList.add('active');
    };
  });

  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildNormalGrid(sources, fallbackTitle) {
  const typeLabel = { sub: 'Subscription', free: 'Free', rent: 'Rent', buy: 'Buy' };
  if (sources && sources.length > 0) {
    const cards = sources.map(s => {
      const logo = PLATFORM_LOGOS[s.name] || '';
      return '<div class="stream-card"><a href="' + s.web_url + '" target="_blank" rel="noopener">' +
        '<div class="stream-logo-wrap">' +
          (logo ? '<img src="' + logo + '" alt="' + s.name + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'"/><span class="logo-fallback" style="display:none">' + s.name + '</span>' : '<span class="logo-fallback">' + s.name + '</span>') +
        '</div>' +
        '<div class="stream-platform-name">' + s.name + '</div>' +
        '<div class="stream-region">' + (s.region || 'Check availability') + '</div>' +
        '<div class="stream-type">' + (typeLabel[s.type] || s.type) + '</div>' +
        '<div class="stream-watch-btn">Watch Now <i class="fas fa-arrow-right"></i></div>' +
        '</a></div>';
    }).join('');
    return '<div class="streaming-grid">' + cards + '</div>';
  }
  /* Fallback */
  const enc = encodeURIComponent(fallbackTitle);
  const fallbacks = [
    { name: 'Netflix',     logo: PLATFORM_LOGOS['Netflix'],      url: 'https://www.netflix.com/search?q=' + enc },
    { name: 'Prime Video', logo: PLATFORM_LOGOS['Amazon Prime'],  url: 'https://www.amazon.com/s?k=' + enc + '+movie' },
    { name: 'Disney+',     logo: PLATFORM_LOGOS['Disney+'],       url: 'https://www.disneyplus.com/search/' + enc },
    { name: 'YouTube',     logo: PLATFORM_LOGOS['YouTube'],       url: 'https://www.youtube.com/results?search_query=' + enc + '+full+movie' },
    { name: 'Showmax',     logo: PLATFORM_LOGOS['Showmax'],       url: 'https://www.showmax.com/search?q=' + enc },
  ];
  const cards = fallbacks.map(s =>
    '<div class="stream-card"><a href="' + s.url + '" target="_blank" rel="noopener">' +
    '<div class="stream-logo-wrap"><img src="' + s.logo + '" alt="' + s.name + '" onerror="this.style.display=\'none\'"/></div>' +
    '<div class="stream-platform-name">' + s.name + '</div>' +
    '<div class="stream-watch-btn">Search <i class="fas fa-search"></i></div>' +
    '</a></div>'
  ).join('');
  return '<p class="no-watchmode-note"><i class="fas fa-info-circle"></i> Searching these platforms directly:</p><div class="streaming-grid">' + cards + '</div>';
}

function buildVJGrid(title) {
  const enc = encodeURIComponent(title);
  const cards = VJ_PLATFORMS.map(p =>
    '<div class="stream-card vj-card"><a href="' + p.url + enc + p.suffix + '" target="_blank" rel="noopener">' +
    '<div class="stream-logo-wrap"><img src="' + p.logo + '" alt="' + p.name + '" onerror="this.style.display=\'none\'"/></div>' +
    '<div class="stream-platform-name">' + p.name + '</div>' +
    '<div class="stream-region">' + p.region + '</div>' +
    '<div class="stream-type">VJ Narrated</div>' +
    '<div class="stream-watch-btn">Find VJ <i class="fas fa-microphone"></i></div>' +
    '</a></div>'
  ).join('');
  return '<div class="streaming-grid">' + cards + '</div>';
}

/* =========================================================
   UI HELPERS
   ========================================================= */
function showLoading() {
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('findBtn').disabled = true;
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('loadingState').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideLoading() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('findBtn').disabled = false;
}
function setStep(n, msg) {
  const el = document.getElementById('loadingText');
  if (el) el.innerHTML = msg + '<span class="dots"></span>';
}
function showError(msg) {
  hideLoading();
  const s = document.getElementById('resultsSection');
  s.classList.remove('hidden');
  s.innerHTML =
    '<div class="error-box">' +
    '<i class="fas fa-exclamation-circle"></i>' +
    '<h3>Could Not Identify</h3>' +
    '<p>' + msg + '</p>' +
    '<button onclick="window.clearUpload()" class="btn-reset"><i class="fas fa-redo"></i> Try Again</button>' +
    '</div>';
}
function animateProgress(from, to, dur) {
  const fill = document.getElementById('progressFill');
  if (!fill) return;
  const start = performance.now();
  (function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    fill.style.width = (from + (to - from) * p) + '%';
    if (p < 1) requestAnimationFrame(tick);
  })(performance.now());
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* =========================================================
   HERO SLIDER
   ========================================================= */
(function() {
  const slides = document.querySelectorAll('.slide');
  const dots   = document.getElementById('slideDots');
  const prev   = document.getElementById('prevSlide');
  const next   = document.getElementById('nextSlide');
  let cur = 0, timer;
  slides.forEach((_, i) => {
    const d = document.createElement('button');
    d.className = 'dot' + (i === 0 ? ' active' : '');
    d.setAttribute('aria-label', 'Slide ' + (i + 1));
    d.onclick = () => go(i);
    dots.appendChild(d);
  });
  function go(n) {
    slides[cur].classList.remove('active'); dots.children[cur].classList.remove('active');
    cur = (n + slides.length) % slides.length;
    slides[cur].classList.add('active'); dots.children[cur].classList.add('active');
    clearInterval(timer); timer = setInterval(() => go(cur + 1), 5000);
  }
  prev.onclick = () => go(cur - 1);
  next.onclick = () => go(cur + 1);
  timer = setInterval(() => go(cur + 1), 5000);
})();

/* =========================================================
   NAVBAR
   ========================================================= */
(function() {
  const nb = document.getElementById('navbar');
  const hb = document.getElementById('hamburger');
  const nl = document.getElementById('navLinks');
  const lk = nl.querySelectorAll('.nav-link');
  window.addEventListener('scroll', () => nb.classList.toggle('scrolled', scrollY > 40));
  hb.onclick = () => nl.classList.toggle('open');
  lk.forEach(l => l.addEventListener('click', () => nl.classList.remove('open')));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        lk.forEach(l => l.classList.remove('active'));
        const a = nl.querySelector('a[href="#' + e.target.id + '"]');
        if (a) a.classList.add('active');
      }
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('section[id],footer[id]').forEach(s => obs.observe(s));
})();

/* Contact form */
document.getElementById('contactForm').addEventListener('submit', function(e) {
  e.preventDefault();
  document.getElementById('formSuccess').classList.remove('hidden');
  this.reset();
  setTimeout(() => document.getElementById('formSuccess').classList.add('hidden'), 5000);
});

/* Scroll reveal */
document.querySelectorAll('.feature-card, .about-content, .about-logo-box').forEach(el => el.classList.add('reveal'));
const ro = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); ro.unobserve(e.target); } });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => ro.observe(el));

/* Loading dots */
setInterval(() => {
  document.querySelectorAll('.dots').forEach(el => {
    el._i = ((el._i || 0) + 1) % 3;
    el.textContent = ['.', '..', '...'][el._i];
  });
}, 500);