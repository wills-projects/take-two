import 'dotenv/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 3001;
const sessionCookieName = 'take-two-session';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(projectRoot, 'dist');
const tmdbBaseUrl = 'https://api.themoviedb.org/3';
const imageBaseUrl = 'https://image.tmdb.org/t/p';
const currentYear = new Date().getFullYear();
const genres = new Map([
  [28, 'Action'], [12, 'Adventure'], [16, 'Animation'], [35, 'Comedy'],
  [80, 'Crime'], [99, 'Documentary'], [18, 'Drama'], [10751, 'Family'],
  [14, 'Fantasy'], [36, 'History'], [27, 'Horror'], [10402, 'Music'],
  [9648, 'Mystery'], [10749, 'Romance'], [878, 'Science fiction'],
  [10770, 'TV movie'], [53, 'Thriller'], [10752, 'War'], [37, 'Western'],
]);

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

function configuredUsers() {
  return [
    { id: 'will', name: 'Will', email: process.env.WILL_EMAIL, password: process.env.WILL_PASSWORD },
    { id: 'lynn', name: 'Lynn', email: process.env.LYNN_EMAIL, password: process.env.LYNN_PASSWORD },
  ].filter((user) => user.email && user.password);
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    const error = new Error('SESSION_SECRET must be configured with at least 32 characters.');
    error.status = 503;
    throw error;
  }
  return secret;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signSession(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    name: user.name,
    email: user.email,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readSession(request) {
  const cookie = String(request.headers.cookie || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${sessionCookieName}=`));
  if (!cookie) return null;

  try {
    const [payload, signature] = cookie.slice(sessionCookieName.length + 1).split('.');
    if (!payload || !signature) return null;
    const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
    if (!safeEqual(signature, expected)) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const user = configuredUsers().find((candidate) => candidate.id === session.id);
    if (!user || session.expiresAt <= Date.now()) return null;
    return { id: user.id, name: user.name, email: user.email };
  } catch (error) {
    if (error.status) throw error;
    return null;
  }
}

function setSessionCookie(response, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  response.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`,
  );
}

function requireUser(request, response, next) {
  response.setHeader('Cache-Control', 'no-store');
  try {
    const user = readSession(request);
    if (!user) return response.status(401).json({ error: 'Please sign in to access the shared diary.' });
    request.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function databaseConfiguration() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const error = new Error('Shared storage is not configured. Add the Supabase URL and service role key.');
    error.status = 503;
    throw error;
  }
  return { url, key };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = databaseConfiguration();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const error = new Error(`Shared storage returned status ${response.status}.`);
    error.status = response.status >= 500 ? 503 : 502;
    throw error;
  }
  return response.json();
}

function sharedData(row) {
  return {
    initialized: true,
    revision: Number(row.revision),
    films: row.films,
    watchlist: row.watchlist,
    updatedAt: row.updated_at,
  };
}

app.post('/api/auth/login', (request, response, next) => {
  try {
    const users = configuredUsers();
    if (users.length !== 2) {
      const error = new Error('Configure both user emails and passwords in the server environment.');
      error.status = 503;
      throw error;
    }
    const email = String(request.body?.email || '').trim().toLowerCase();
    const password = String(request.body?.password || '');
    const user = users.find((candidate) =>
      safeEqual(candidate.email.toLowerCase(), email) && safeEqual(candidate.password, password),
    );
    if (!user) return response.status(401).json({ error: 'That email and password do not match.' });
    setSessionCookie(response, signSession(user), 7 * 24 * 60 * 60);
    return response.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/auth/session', (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  try {
    const user = readSession(request);
    if (!user) return response.status(401).json({ error: 'No active session.' });
    return response.json({ user });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/logout', (_request, response) => {
  setSessionCookie(response, '', 0);
  response.status(204).end();
});

app.get('/api/data', requireUser, async (_request, response, next) => {
  try {
    const rows = await supabaseRequest(
      'shared_collection?id=eq.take-two&select=id,revision,films,watchlist,updated_at',
    );
    response.setHeader('Cache-Control', 'no-store');
    if (!rows.length) {
      return response.json({ initialized: false, revision: 0, films: [], watchlist: [], updatedAt: null });
    }
    return response.json(sharedData(rows[0]));
  } catch (error) {
    return next(error);
  }
});

app.put('/api/data', requireUser, async (request, response, next) => {
  const { expectedRevision, films, watchlist } = request.body || {};
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    !Array.isArray(films) ||
    !Array.isArray(watchlist) ||
    films.length > 2000 ||
    watchlist.length > 2000
  ) {
    return response.status(400).json({ error: 'The shared diary data is invalid.' });
  }

  try {
    const result = await supabaseRequest('rpc/save_take_two_shared_data', {
      method: 'POST',
      body: JSON.stringify({ p_films: films, p_watchlist: watchlist, p_expected_revision: expectedRevision }),
    });
    const data = {
      initialized: true,
      revision: Number(result.revision),
      films: result.films,
      watchlist: result.watchlist,
      updatedAt: result.updated_at,
    };
    return response.status(result.saved ? 200 : 409).json(data);
  } catch (error) {
    return next(error);
  }
});

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function movieSummary(movie) {
  const artwork = movie.poster_path || movie.backdrop_path;
  if (!movie.id || !movie.title) return null;

  return {
    id: movie.id,
    tmdbId: movie.id,
    title: movie.title,
    year: movie.release_date ? Number(movie.release_date.slice(0, 4)) : null,
    rating: Number(movie.vote_average || 0).toFixed(1),
    voteCount: Number(movie.vote_count || 0),
    overview: movie.overview || '',
    genres: movie.genre_ids?.map((id) => genres.get(id)).filter(Boolean) || [],
    image: artwork ? `${imageBaseUrl}/w500${artwork}` : '',
    backdrop: movie.backdrop_path
      ? `${imageBaseUrl}/w1280${movie.backdrop_path}`
      : artwork ? `${imageBaseUrl}/w1280${artwork}` : '',
    color: 'rose',
    watched: false,
  };
}

async function tmdbRequest(path, params = {}) {
  const url = new URL(`${tmdbBaseUrl}${path}`);
  const headers = { accept: 'application/json' };
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;

  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else if (apiKey) {
    url.searchParams.set('api_key', apiKey);
  } else {
    const error = new Error(
      'TMDB is not configured. Add TMDB_API_READ_ACCESS_TOKEN to your .env file.',
    );
    error.status = 503;
    throw error;
  }

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const error = new Error(`TMDB returned status ${response.status}.`);
    error.status = response.status === 429 ? 503 : 502;
    throw error;
  }

  return response.json();
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, tmdbConfigured: Boolean(process.env.TMDB_API_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY) });
});

app.get('/api/movies/search', async (request, response, next) => {
  const query = String(request.query.query || '').trim();
  const page = Number(request.query.page || 1);

  if (query.length < 2 || query.length > 120) {
    return response.status(400).json({ error: 'Search text must be between 2 and 120 characters.' });
  }
  if (!Number.isInteger(page) || page < 1 || page > 500) {
    return response.status(400).json({ error: 'Search page must be between 1 and 500.' });
  }

  try {
    const result = await tmdbRequest('/search/movie', {
      query,
      include_adult: 'false',
      language: 'en-US',
      page,
    });
    const results = (result.results || []).map(movieSummary).filter(Boolean);
    response.json({
      results,
      page: result.page || page,
      totalPages: Math.min(result.total_pages || 0, 500),
      totalResults: result.total_results || 0,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/movies/runtimes', async (request, response, next) => {
  const rawIds = String(request.query.ids || '');
  const ids = [...new Set(rawIds.split(',').map(Number))];
  if (!rawIds || rawIds.length > 1200 || ids.length > 50 ||
      ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    return response.status(400).json({ error: 'Provide between 1 and 50 valid movie IDs.' });
  }

  try {
    const runtimes = await Promise.all(ids.map(async (id) => {
      const details = await tmdbRequest(`/movie/${id}`, { language: 'en-US' });
      return [id, Number.isInteger(details.runtime) && details.runtime > 0
        ? details.runtime
        : null];
    }));
    response.json({ runtimes: Object.fromEntries(runtimes) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/movies/recommendation', async (request, response, next) => {
  const rawExcludedIds = String(request.query.exclude || '');
  if (rawExcludedIds.length > 12000) {
    return response.status(400).json({ error: 'Too many movie IDs to exclude.' });
  }
  const excludedIds = new Set(
    rawExcludedIds
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id > 0),
  );
  const candidates = [];

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const year = randomInteger(1920, currentYear);
      const yearFilter = {
        'primary_release_date.gte': `${year}-01-01`,
        'primary_release_date.lte': `${year}-12-31`,
        include_adult: 'false',
        include_video: 'false',
        language: 'en-US',
        'vote_count.gte': 101,
        sort_by: 'popularity.desc',
      };

      const firstPage = await tmdbRequest('/discover/movie', {
        ...yearFilter,
        page: 1,
      });
      const lastPage = Math.min(firstPage.total_pages || 0, 500);
      if (lastPage < 1) continue;

      const page = randomInteger(1, lastPage);
      const result = page === 1
        ? firstPage
        : await tmdbRequest('/discover/movie', { ...yearFilter, page });

      for (const movie of result.results || []) {
        if (
          !excludedIds.has(movie.id) &&
          Number(movie.vote_count) > 100 &&
          movieSummary(movie)
        ) {
          candidates.push(movie);
        }
      }
    }

    if (candidates.length === 0) {
      return response.status(404).json({
        error: 'No new recommendation was found. Please try again.',
      });
    }

    const chosen = candidates[randomInteger(0, candidates.length - 1)];
    const details = await tmdbRequest(`/movie/${chosen.id}`, {
      language: 'en-US',
      append_to_response: 'credits',
    });
    const director =
      details.credits?.crew?.find((person) => person.job === 'Director')?.name || '';
    const movie = movieSummary({
      ...chosen,
      genre_ids: details.genres?.map((genre) => genre.id) || chosen.genre_ids,
    });

    response.json({
      ...movie,
      director,
      genres: details.genres?.map((genre) => genre.name) || movie.genres,
      overview: chosen.overview || 'A new film to discover together.',
    });
  } catch (error) {
    next(error);
  }
});

if (existsSync(path.join(buildDirectory, 'index.html'))) {
  app.use(express.static(buildDirectory));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) {
      return next();
    }
    return response.sendFile(path.join(buildDirectory, 'index.html'));
  });
}

app.use((error, _request, response, _next) => {
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return response.status(504).json({ error: 'A Take Two service took too long to respond. Please try again.' });
  }
  if (error.status) {
    return response.status(error.status).json({ error: error.message });
  }
  console.error('Take Two API error:', error);
  return response.status(500).json({ error: 'Take Two is temporarily unavailable.' });
});

export default app;

if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`Take Two API listening on http://localhost:${port}`);
  });
}
