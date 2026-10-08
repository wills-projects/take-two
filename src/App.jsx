import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  starterWatchlist,
  watchedMovies,
  watchedStorageKey,
  watchlistStorageKey,
} from './data/movies.js';
import {
  clearCurrentUser,
  readCurrentUser,
  signIn,
} from './services/auth.js';
import { loadPublicData, loadSharedData, saveSharedData } from './services/sharedData.js';
import { getMovieRuntimes, getRandomRecommendation, searchMovies } from './services/tmdb.js';

const ratingOptions = Array.from({ length: 10 }, (_, index) => 10 - index);
const normalizeRating = (rating) => {
  const numericRating = Number(rating);
  return rating && Number.isFinite(numericRating) && numericRating >= 1 && numericRating <= 10
    ? String(Math.round(numericRating))
    : '';
};

function Icon({ name, size = 18 }) {
  const shared = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (name === 'heart') {
    return (
      <svg {...shared}>
        <path d="M20.8 8.7c0 5-8.8 10.2-8.8 10.2S3.2 13.7 3.2 8.7A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.8 2.1Z" />
      </svg>
    );
  }
  if (name === 'search') {
    return (
      <svg {...shared}>
        <circle cx="10.8" cy="10.8" r="6.3" />
        <path d="m15.5 15.5 4.1 4.1" />
      </svg>
    );
  }
  if (name === 'plus') {
    return (
      <svg {...shared}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  return (
    <svg {...shared}>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function readMovieList(key, fallback) {
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved && key === watchlistStorageKey) {
      const legacyDiary = window.localStorage.getItem(watchedStorageKey);
      if (legacyDiary) {
        const legacyMovies = JSON.parse(legacyDiary);
        if (Array.isArray(legacyMovies)) {
          const knownMovies = [...watchedMovies, ...starterWatchlist];
          const migratedWatchlist = legacyMovies
            .filter((movie) => !movie.watched)
            .map((movie) => {
              const knownMovie = knownMovies.find(
                (candidate) => candidate.title === movie.title,
              );
              return knownMovie ? { ...movie, tmdbId: movie.tmdbId || knownMovie.tmdbId } : movie;
            });
          const ids = new Set(migratedWatchlist.map((movie) => movie.tmdbId));
          return [...migratedWatchlist, ...fallback.filter((movie) => !ids.has(movie.tmdbId))];
        }
      }
    }
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return fallback;
    const knownMovies = [...watchedMovies, ...starterWatchlist];
    const migrated = parsed.map((movie) => {
      const knownMovie = knownMovies.find(
        (candidate) => candidate.title === movie.title,
      );
      if (!knownMovie) return movie;
      return {
        ...knownMovie,
        ...movie,
        tmdbId: movie.tmdbId || knownMovie.tmdbId,
        description: movie.description || knownMovie.description || movie.note || '',
        willRating: movie.willRating || movie.rating || knownMovie.willRating,
        lynnRating: movie.lynnRating || knownMovie.lynnRating,
        willReview: movie.willReview || knownMovie.willReview,
        lynnReview: movie.lynnReview || knownMovie.lynnReview,
      };
    });
    return key === watchedStorageKey
      ? migrated.filter((movie) => movie.watched !== false)
      : migrated;
  } catch (error) {
    console.error(`Could not load saved movies (${key}).`, error);
    return fallback;
  }
}

function LoginPage({ onLogin, initialError = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await onLogin(email, password);
    } catch (loginError) {
      setError(loginError.message);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <a className="wordmark login-wordmark" href="/" aria-label="Take Two home">
          take two<span className="wordmark-period">.</span>
          <span className="wordmark-subtitle">A FILM DIARY</span>
        </a>
        <span className="login-rule" />
        <h1>Just the<br /><em>two of us.</em></h1>
        <p className="login-intro">Visiting our films and memories with love.</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            autoComplete="username"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="button button-primary login-submit" type="submit">
            Sign in <Icon name="arrow" size={15} />
          </button>
        </form>
        <a className="guest-browse-link" href="/home">Browse as a guest <Icon name="arrow" size={14} /></a>
      </div>
      <div className="login-photo" role="img" aria-label="Will and Lynn celebrating a birthday over dessert">
        <div className="login-photo-overlay" />
        <p>Peace is where a smile makes you<br /><em>feel warm.</em>”</p>
        <span>A PRIVATE FILM DIARY FOR WILL & LYNN</span>
      </div>
    </main>
  );
}

function FilmCard({ film, watched, onToggle, readOnly = false, index = 0 }) {
  const [showDetails, setShowDetails] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <article className="film-card" style={{ '--card-delay': `${index * 70}ms` }}>
      <div className={`poster-button ${film.image || film.backdrop ? '' : 'poster-no-image'}`}>
        {(film.image || film.backdrop) && (
          <img src={film.image || film.backdrop} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement?.classList.add('poster-no-image'); }} />
        )}
        {!watched && (
          <button
            className="poster-details-trigger"
            type="button"
            aria-label={`${showDetails ? 'Hide' : 'Show'} ${film.title} description`}
            aria-expanded={showDetails}
            onClick={() => setShowDetails((visible) => !visible)}
          />
        )}
        <span className={`poster-wash ${film.color || 'rose'}`} />
        <span className="poster-top">
          {watched ? (
            <>
              <span className="watched-mark">WATCHED TOGETHER</span>
              <span className="rating-badge">{film.rating ? `★ ${film.rating}` : '♥'}</span>
            </>
          ) : !readOnly ? (
            <span className="watchlist-card-actions">
              <button className="watchlist-heart-button" onClick={() => onToggle(film)} aria-label={`Add ${film.title} to diary`} type="button">
                <Icon name="heart" size={21} />
              </button>
              <button className="watchlist-remove-button" onClick={() => setConfirmRemove((open) => !open)} aria-label={`Remove ${film.title} from watchlist`} aria-expanded={confirmRemove} type="button">×</button>
            </span>
          ) : null}
        </span>
        {!watched && confirmRemove && (
          <div className="inline-remove-confirm" role="group" aria-label={`Confirm removing ${film.title}`}>
            <span>Remove from watchlist?</span>
            <div>
              <button type="button" onClick={() => setConfirmRemove(false)}>Cancel</button>
              <button type="button" onClick={() => onToggle(film, 'remove-confirmed')}>Remove</button>
            </div>
          </div>
        )}
        <span className="poster-title">
          <span className="poster-title-main">{film.title}</span>
          <span className="poster-meta">
            {film.year}
          </span>
        </span>
        {!watched && showDetails && (
          <div className="poster-description-panel">
            <span>ABOUT THE FILM</span>
            <p>{film.overview || film.description || 'No synopsis is available for this film.'}</p>
          </div>
        )}
      </div>
      {watched && <div className="film-card-foot">
        <div>
          <span className="date-label">{film.date}</span>
          <p>{film.description || film.overview || film.note || 'A little movie-night memory, saved for later.'}</p>
        </div>
        {!readOnly && <button className="mood-tag film-remove" onClick={() => onToggle(film)} aria-label={`Remove ${film.title} from diary`}>
          Remove <span aria-hidden="true">×</span>
        </button>}
      </div>}
    </article>
  );
}

function DiaryEntry({ film, onEdit, onRemove, readOnly = false, index = 0 }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const willScore = Number(film.willRating || film.rating);
  const lynnScore = Number(film.lynnRating);
  const sharedScore = Number.isFinite(willScore) && willScore > 0 && Number.isFinite(lynnScore) && lynnScore > 0
    ? ((willScore + lynnScore) / 2).toFixed(1)
    : '—';

  return (
    <article className={`diary-entry${confirmRemove ? ' is-confirming-remove' : ''}`} style={{ '--card-delay': `${index * 40}ms` }}>
      <div className={`diary-entry-art ${film.color || 'rose'}`}>
        {(film.image || film.backdrop) && (
          <img src={film.image || film.backdrop} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />
        )}
      </div>
      <div className="diary-entry-copy">
        <div className="diary-entry-heading">
          <div>
            <span className="date-label">WATCHED {film.date ? `· ${film.date}` : ''}</span>
            <h3>{film.title} <span>{film.year}</span></h3>
            {film.director && <p className="diary-director">Directed by {film.director}</p>}
          </div>
        </div>
        <div className="diary-memories">
          {film.willReview && <p className="diary-review"><strong>Will’s review</strong>{film.willReview}</p>}
          {film.lynnReview && <p className="diary-review"><strong>Lynn’s review</strong>{film.lynnReview}</p>}
          {(film.description || film.overview) && <p className="diary-review"><strong>About the film</strong>{film.description || film.overview}</p>}
        </div>
        {film.mood && <span className="mood-tag"><span>♡</span> {film.mood}</span>}
      </div>
      <div className="diary-entry-aside">
        <div className="diary-ratings">
          <span className="diary-total-rating"><small>TOGETHER</small>★ {sharedScore}<small>/ 10</small></span>
          <span className="diary-rating"><small>WILL</small> ★ {film.willRating || film.rating || '—'}<small>/ 10</small></span>
          <span className="diary-rating"><small>LYNN</small> ★ {film.lynnRating || '—'}<small>/ 10</small></span>
        </div>
        {!readOnly && <div className="diary-entry-actions">
          <button className="diary-edit" type="button" onClick={() => onEdit(film)}>Edit</button>
          <div className="diary-remove-wrap">
            <button className="diary-remove" onClick={() => setConfirmRemove((open) => !open)} aria-label={`Remove ${film.title} from diary`} aria-expanded={confirmRemove}>
              Remove <span aria-hidden="true">×</span>
            </button>
            {confirmRemove && (
              <div className="inline-remove-confirm diary-remove-confirm" role="group" aria-label={`Confirm removing ${film.title}`}>
                <span>Remove from diary?</span>
                <div>
                  <button type="button" onClick={() => setConfirmRemove(false)}>Cancel</button>
                  <button type="button" onClick={() => onRemove(film)}>Remove</button>
                </div>
              </div>
            )}
          </div>
        </div>}
      </div>
    </article>
  );
}

function SearchBox({ search, setSearch }) {
  return (
    <label className="search-box">
      <Icon name="search" size={17} />
      <input
        type="search"
        placeholder="Find a film..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search films"
      />
      <kbd>⌘ K</kbd>
    </label>
  );
}

function EmptyState({ message, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <span className="empty-heart">♡</span>
      <h3>{message}</h3>
      <p>Save a film for your next movie night.</p>
      {actionLabel && onAction && (
        <button className="button button-primary empty-state-action" type="button" onClick={onAction}>
          <Icon name="plus" size={15} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

function MemoryStrip({ watchedCount, totalMinutes, missingRuntimeCount, runtimeLoading, averageRating }) {
  let timeTogether = `${totalMinutes} minutes`;
  if (runtimeLoading) timeTogether = 'Adding up runtimes…';
  else if (missingRuntimeCount) timeTogether = `Runtime unavailable for ${missingRuntimeCount} ${missingRuntimeCount === 1 ? 'film' : 'films'}`;

  return (
    <aside className="memory-strip">
      <div className="memory-icon"><Icon name="heart" size={19} /></div>
      <div className="memory-copy">
        <span>A SMALL THING WORTH REMEMBERING</span>
        <p>You’ve watched <strong>{watchedCount} films</strong> together. <strong>{timeTogether}</strong>{!runtimeLoading && !missingRuntimeCount ? ' of choosing the same couch.' : ''}</p>
      </div>
      <div className="memory-stat"><strong>{averageRating}</strong><span>YOUR AVERAGE<br />TOGETHER</span></div>
      <div className="memory-sparkle">✳</div>
    </aside>
  );
}

function collectionKey(film) {
  return String(film.tmdbId || film.id);
}

function mergeCollection(base, local, remote) {
  const baseById = new Map(base.map((film) => [collectionKey(film), film]));
  const localById = new Map(local.map((film) => [collectionKey(film), film]));
  const merged = new Map(remote.map((film) => [collectionKey(film), film]));

  for (const [id] of baseById) {
    if (!localById.has(id)) merged.delete(id);
  }
  for (const [id, film] of localById) {
    const previous = baseById.get(id);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(film)) {
      merged.set(id, film);
    }
  }
  return [...merged.values()];
}

function mergeSharedData(base, local, remote) {
  return {
    films: mergeCollection(base.films, local.films, remote.films),
    watchlist: mergeCollection(base.watchlist, local.watchlist, remote.watchlist),
  };
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [route, setRoute] = useState(window.location.pathname);
  const [films, setFilms] = useState([]);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState('');
  const [runtimeById, setRuntimeById] = useState({});
  const [runtimeCheckedById, setRuntimeCheckedById] = useState({});
  const [watchlist, setWatchlist] = useState([]);
  const [sharedDataReady, setSharedDataReady] = useState(false);
  const [sharedDataError, setSharedDataError] = useState('');
  const [sharedRetry, setSharedRetry] = useState(0);
  const sharedRevision = useRef(0);
  const syncedSnapshot = useRef({ films: [], watchlist: [] });
  const [search, setSearch] = useState('');
  const [recommendation, setRecommendation] = useState(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [showAddFilm, setShowAddFilm] = useState(false);
  const [addDestination, setAddDestination] = useState('diary');
  const [movieQuery, setMovieQuery] = useState('');
  const [movieResults, setMovieResults] = useState([]);
  const [movieResultsPage, setMovieResultsPage] = useState(1);
  const [movieTotalPages, setMovieTotalPages] = useState(0);
  const [movieMoreLoading, setMovieMoreLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [movieSearchLoading, setMovieSearchLoading] = useState(false);
  const [movieSearchError, setMovieSearchError] = useState('');
  const [reviewFilm, setReviewFilm] = useState(null);
  const [editingDiaryFilm, setEditingDiaryFilm] = useState(null);
  const [willRating, setWillRating] = useState('');
  const [lynnRating, setLynnRating] = useState('');
  const [willReview, setWillReview] = useState('');
  const [lynnReview, setLynnReview] = useState('');
  const [sharedMemory, setSharedMemory] = useState('');

  const canViewCollection = Boolean(currentUser) || route !== '/login';
  const isReadOnly = !currentUser;

  function navigate(path, replace = false) {
    if (window.location.pathname !== path) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
    }
    setRoute(path);
    setSearch('');
    setShowUserMenu(false);
  }

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    readCurrentUser()
      .then((user) => {
        if (active) setCurrentUser(user);
      })
      .catch((error) => {
        if (active) setAuthError(error.message);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser && route === '/') {
      navigate('/home', true);
    } else if (!currentUser && route !== '/login' && !['/home', '/watchlist', '/diary'].includes(route)) {
      navigate('/home', true);
    } else if (currentUser && (route === '/login' || route === '/')) {
      navigate('/home', true);
    } else if (currentUser && !['/home', '/watchlist', '/diary'].includes(route)) {
      navigate('/home', true);
    }
  }, [authLoading, currentUser, route]);

  useEffect(() => {
    if (!canViewCollection) {
      setSharedDataReady(false);
      setSharedDataError('');
      sharedRevision.current = 0;
      syncedSnapshot.current = { films: [], watchlist: [] };
      setFilms([]);
      setWatchlist([]);
      return undefined;
    }

    let active = true;
    setSharedDataReady(false);
    setSharedDataError('');

    async function initializeSharedData() {
      try {
        let data = currentUser ? await loadSharedData() : await loadPublicData();
        if (currentUser && !data.initialized) {
          const migrationData = {
            films: readMovieList(watchedStorageKey, watchedMovies),
            watchlist: readMovieList(watchlistStorageKey, starterWatchlist),
          };
          data = await saveSharedData(migrationData, 0);
          if (data.conflict) data = await loadSharedData();
        }
        if (!active) return;
        const snapshot = { films: data.films, watchlist: data.watchlist };
        sharedRevision.current = data.revision;
        syncedSnapshot.current = snapshot;
        setFilms(snapshot.films);
        setWatchlist(snapshot.watchlist);
        setSharedDataReady(true);
      } catch (error) {
        if (active) {
          setSharedDataError(error.message);
          setSharedDataReady(false);
        }
      }
    }

    initializeSharedData();
    return () => { active = false; };
  }, [canViewCollection, currentUser, sharedRetry]);

  useEffect(() => {
    if (!currentUser || !sharedDataReady) return undefined;
    const snapshot = { films, watchlist };
    if (JSON.stringify(snapshot) === JSON.stringify(syncedSnapshot.current)) return undefined;

    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        const result = await saveSharedData(snapshot, sharedRevision.current);
        if (!active) return;
        if (result.conflict) {
          const latest = { films: result.films, watchlist: result.watchlist };
          const merged = mergeSharedData(syncedSnapshot.current, snapshot, latest);
          sharedRevision.current = result.revision;
          syncedSnapshot.current = latest;
          setFilms(merged.films);
          setWatchlist(merged.watchlist);
          return;
        }

        sharedRevision.current = result.revision;
        syncedSnapshot.current = snapshot;
        setSharedDataError('');
      } catch (error) {
        if (active) {
          setSharedDataError(error.message);
          setToast(`Your changes have not synced: ${error.message}`);
        }
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [currentUser, films, sharedDataReady, watchlist]);

  useEffect(() => {
    if (!canViewCollection || !sharedDataReady) return undefined;
    let active = true;
    const poll = window.setInterval(async () => {
      try {
        const latest = currentUser ? await loadSharedData() : await loadPublicData();
        if (!active || latest.revision <= sharedRevision.current) return;
        const remote = { films: latest.films, watchlist: latest.watchlist };
        if (!currentUser) {
          sharedRevision.current = latest.revision;
          syncedSnapshot.current = remote;
          setFilms(remote.films);
          setWatchlist(remote.watchlist);
          setSharedDataError('');
          return;
        }
        const current = { films, watchlist };
        const merged = mergeSharedData(syncedSnapshot.current, current, remote);
        sharedRevision.current = latest.revision;
        syncedSnapshot.current = remote;
        setFilms(merged.films);
        setWatchlist(merged.watchlist);
        setSharedDataError('');
      } catch (error) {
        if (active) setSharedDataError(error.message);
      }
    }, 10000);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [canViewCollection, currentUser, films, sharedDataReady, watchlist]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!showAddFilm || movieQuery.trim().length < 2 || selectedMovie) {
      setMovieResults([]);
      setMovieResultsPage(1);
      setMovieTotalPages(0);
      setMovieSearchLoading(false);
      setMovieSearchError('');
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setMovieSearchLoading(true);
      setMovieSearchError('');
      try {
        const result = await searchMovies(movieQuery, 1, controller.signal);
        setMovieResults(result.results);
        setMovieResultsPage(result.page);
        setMovieTotalPages(result.totalPages);
      } catch (error) {
        if (error.name === 'AbortError') return;
        if (import.meta.env.DEV) console.warn('TMDB movie search unavailable.', error);
        setMovieResults([]);
        setMovieSearchError(error.message);
      } finally {
        if (!controller.signal.aborted) setMovieSearchLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [movieQuery, selectedMovie, showAddFilm]);

  useEffect(() => {
    if (!canViewCollection || route !== '/home' || recommendation) return undefined;
    let active = true;
    const excludedIds = [
      ...films.map((film) => film.tmdbId),
      ...watchlist.map((film) => film.tmdbId),
    ].filter(Boolean);
    setRecommendationLoading(true);
    setRecommendationError('');

    async function loadInitialRecommendation() {
      try {
        const result = await getRandomRecommendation(excludedIds);
        if (active) setRecommendation(result);
      } catch (error) {
        if (import.meta.env.DEV) console.warn('TMDB recommendation unavailable.', error);
        if (active) setRecommendationError(error.message);
      } finally {
        if (active) setRecommendationLoading(false);
      }
    }

    loadInitialRecommendation();
    return () => { active = false; };
  }, [canViewCollection, currentUser, route, films, watchlist, recommendation]);

  useEffect(() => {
    if (!canViewCollection || route !== '/home') return undefined;
    const missingRuntimeIds = [...new Set(
      films
        .filter((film) => film.watched && !runtimeCheckedById[film.tmdbId])
        .map((film) => Number(film.tmdbId))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    )];
    if (!missingRuntimeIds.length) {
      setRuntimeLoading(false);
      setRuntimeError('');
      return undefined;
    }

    const controller = new AbortController();
    setRuntimeLoading(true);
    setRuntimeError('');
    Promise.all(Array.from({ length: Math.ceil(missingRuntimeIds.length / 50) }, (_, index) =>
      getMovieRuntimes(missingRuntimeIds.slice(index * 50, (index + 1) * 50), controller.signal),
    ))
      .then((results) => {
        const runtimes = Object.assign({}, ...results.map((result) => result.runtimes));
        setRuntimeById((current) => ({ ...current, ...runtimes }));
        setRuntimeCheckedById((current) => ({
          ...current,
          ...Object.fromEntries(missingRuntimeIds.map((id) => [id, true])),
        }));
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        if (import.meta.env.DEV) console.warn('Could not load diary film runtimes.', error);
        setRuntimeError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRuntimeLoading(false);
      });

    return () => controller.abort();
  }, [canViewCollection, currentUser, route, films, runtimeCheckedById]);

  const activeView = route === '/watchlist' ? 'watchlist' : route === '/diary' ? 'diary' : 'home';
  const watchedCount = films.filter((film) => film.watched).length;
  const diaryFilms = films.filter((film) => film.watched);
  const totalMinutes = diaryFilms.reduce((sum, film) => {
    const runtime = runtimeById[film.tmdbId];
    return sum + (Number.isInteger(runtime) && runtime > 0 ? runtime : 0);
  }, 0);
  const missingRuntimeCount = diaryFilms.filter((film) => {
    const runtime = runtimeById[film.tmdbId];
    return !Number.isInteger(runtime) || runtime < 1;
  }).length;
  const ratings = films.flatMap((film) => {
    const personalRatings = [film.willRating, film.lynnRating]
      .filter(Boolean)
      .map(Number);
    return personalRatings.length ? personalRatings : film.rating ? [Number(film.rating)] : [];
  });
  const averageRating = ratings.length
    ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
    : '—';
  const displayedMovies = useMemo(() => {
    const collection = activeView === 'watchlist' ? watchlist : films;
    const query = search.trim().toLowerCase();
    return collection.filter((film) =>
      `${film.title} ${film.year} ${film.director || ''} ${film.mood || ''}`
        .toLowerCase()
        .includes(query),
    );
  }, [activeView, films, search, watchlist]);

  async function login(email, password) {
    const user = await signIn(email, password);
    setAuthError('');
    setCurrentUser(user);
    navigate('/home', true);
  }

  async function logout() {
    try {
      await clearCurrentUser();
      setCurrentUser(null);
      navigate('/login', true);
    } catch (error) {
      setToast(`Could not sign out: ${error.message}`);
    }
  }

  function toggleWatched(film) {
    if (!currentUser) return;
    if (film.watched) {
      setFilms((current) => current.filter((item) => item.tmdbId !== film.tmdbId));
      setToast('Removed from your diary.');
      return;
    }

    setReviewFilm(film);
    setEditingDiaryFilm(null);
    setWillRating(normalizeRating(film.willRating || film.rating));
    setLynnRating(normalizeRating(film.lynnRating));
    setWillReview(film.willReview || '');
    setLynnReview(film.lynnReview || '');
    setSharedMemory('');
  }

  function saveReview(event) {
    event.preventDefault();
    if (!currentUser) return;
    const filmBeingReviewed = editingDiaryFilm || reviewFilm;
    if (!filmBeingReviewed) return;
    const reviewedFilm = {
      ...filmBeingReviewed,
      id: filmBeingReviewed.id || filmBeingReviewed.tmdbId || Date.now(),
      watched: true,
      date: editingDiaryFilm
        ? editingDiaryFilm.date
        : new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }),
      rating: '',
      willRating,
      lynnRating,
      willReview: willReview.trim(),
      lynnReview: lynnReview.trim(),
      description: sharedMemory.trim(),
      note: '',
    };
    if (editingDiaryFilm) {
      setFilms((current) => current.map((film) =>
        film.tmdbId === reviewedFilm.tmdbId ? reviewedFilm : film,
      ));
      setEditingDiaryFilm(null);
      setToast('Diary entry updated.');
      return;
    }
    setWatchlist((current) =>
      current.filter((item) => item.tmdbId !== filmBeingReviewed.tmdbId),
    );
    setFilms((current) => [
      reviewedFilm,
      ...current.filter((item) => item.tmdbId !== reviewedFilm.tmdbId),
    ]);
    setReviewFilm(null);
    setToast('Review saved to your diary.');
  }

  function editDiaryFilm(film) {
    if (!currentUser) return;
    setReviewFilm(null);
    setEditingDiaryFilm(film);
    setWillRating(normalizeRating(film.willRating || film.rating));
    setLynnRating(normalizeRating(film.lynnRating));
    setWillReview(film.willReview || '');
    setLynnReview(film.lynnReview || '');
    setSharedMemory(film.description || film.overview || '');
  }

  function closeReviewModal() {
    setReviewFilm(null);
    setEditingDiaryFilm(null);
  }

  function openAddFilm(destination) {
    if (!currentUser) return;
    setAddDestination(destination);
    setMovieQuery('');
    setMovieResults([]);
    setMovieResultsPage(1);
    setMovieTotalPages(0);
    setSelectedMovie(null);
    setMovieSearchError('');
    setWillRating('');
    setLynnRating('');
    setWillReview('');
    setLynnReview('');
    setSharedMemory('');
    setShowAddFilm(true);
  }

  function saveSelectedMovie(event) {
    event.preventDefault();
    if (!currentUser) return;
    if (!selectedMovie) {
      setToast('Search for and choose a film first.');
      return;
    }
    const film = {
      ...selectedMovie,
      id: selectedMovie.tmdbId || selectedMovie.id,
      color: selectedMovie.color || 'rose',
      watched: addDestination === 'diary',
    };
    const target = addDestination === 'diary' ? films : watchlist;
    if (target.some((existing) => existing.tmdbId === film.tmdbId)) {
      setToast(`${film.title} is already in your ${addDestination === 'diary' ? 'diary' : 'watchlist'}.`);
      return;
    }
    if (addDestination === 'diary') {
      setFilms((current) => [{
        ...film,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        willRating,
        lynnRating,
        willReview: willReview.trim(),
        lynnReview: lynnReview.trim(),
        description: sharedMemory.trim(),
        note: '',
        rating: '',
      }, ...current]);
    } else {
      setWatchlist((current) => [film, ...current]);
    }
    setShowAddFilm(false);
    setToast(addDestination === 'diary' ? 'Added to your diary.' : 'Added to your watchlist.');
  }

  function removeFromWatchlist(film) {
    if (!currentUser) return;
    setWatchlist((current) => current.filter((item) => item.tmdbId !== film.tmdbId));
    setToast(`${film.title} removed from your watchlist.`);
  }

  function selectWatchlistMovie(film) {
    if (!currentUser) return;
    if (watchlist.some((item) => item.tmdbId === film.tmdbId)) {
      setToast(`${film.title} is already on your watchlist.`);
      return;
    }
    setWatchlist((current) => [{ ...film, watched: false, note: '' }, ...current]);
    setShowAddFilm(false);
    setMovieQuery('');
    setToast(`${film.title} added to your watchlist.`);
  }

  function chooseMovie(film) {
    if (addDestination === 'watchlist') {
      if (films.some((item) => item.tmdbId === film.tmdbId)) {
        setToast(`${film.title} is already in your diary.`);
        return;
      }
      selectWatchlistMovie(film);
      return;
    }
    if (films.some((item) => item.tmdbId === film.tmdbId) || watchlist.some((item) => item.tmdbId === film.tmdbId)) {
      setToast(`${film.title} is already saved.`);
      return;
    }
    setSelectedMovie(film);
    setWillRating('');
    setLynnRating('');
    setWillReview('');
    setLynnReview('');
    setSharedMemory('');
  }

  async function surpriseUs() {
    const excludedIds = [
      ...films.map((film) => film.tmdbId),
      ...watchlist.map((film) => film.tmdbId),
      recommendation?.tmdbId,
    ].filter(Boolean);
    setRecommendationLoading(true);
    setRecommendationError('');
    try {
      const result = await getRandomRecommendation(excludedIds);
      setRecommendation(result);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('TMDB recommendation unavailable.', error);
      setRecommendationError(error.message);
    } finally {
      setRecommendationLoading(false);
    }

  }

  async function loadMoreMovieResults() {
    const nextPage = movieResultsPage + 1;
    setMovieMoreLoading(true);
    setMovieSearchError('');
    try {
      const result = await searchMovies(movieQuery, nextPage);
      setMovieResults((current) => [...current, ...result.results]);
      setMovieResultsPage(result.page);
      setMovieTotalPages(result.totalPages);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('Could not load more TMDB search results.', error);
      setMovieSearchError(error.message);
    } finally {
      setMovieMoreLoading(false);
    }
  }

  function saveRecommendation() {
    if (!currentUser) return;
    if (!recommendation) return;
    if (watchlist.some((film) => film.tmdbId === recommendation.tmdbId)) {
      setToast('This one is already on your watchlist.');
      return;
    }
    setWatchlist((current) => [
      { ...recommendation, color: 'rose', watched: false, note: '' },
      ...current,
    ]);
    setToast('Tucked into your watchlist.');
  }

  const activeReviewFilm = editingDiaryFilm || reviewFilm;

  if (authLoading) {
    return <main className="session-loading">Opening your shared film diary…</main>;
  }

  if (route === '/login') {
    if (currentUser) return null;
    return <LoginPage onLogin={login} initialError={authError} />;
  }

  if (!sharedDataReady) {
    return (
      <main className="session-loading">
        <section>
          <h1>{sharedDataError ? 'Your shared diary isn’t available yet.' : 'Opening your shared film diary…'}</h1>
          {sharedDataError && (
            <>
              <p>{sharedDataError}</p>
              <button className="button button-primary" type="button" onClick={() => setSharedRetry((value) => value + 1)}>
                Try again
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/home" onClick={(event) => { event.preventDefault(); navigate('/home'); }} aria-label="Take Two home">
          take two<span className="wordmark-period">.</span>
          <span className="wordmark-subtitle">A FILM DIARY</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className={activeView === 'home' ? 'nav-link active' : 'nav-link'} href="/home" onClick={(event) => { event.preventDefault(); navigate('/home'); }}>Home</a>
          <a className={activeView === 'watchlist' ? 'nav-link active' : 'nav-link'} href="/watchlist" onClick={(event) => { event.preventDefault(); navigate('/watchlist'); }}>
            Watchlist <span className="nav-count">{watchlist.length}</span>
          </a>
          <a className={activeView === 'diary' ? 'nav-link active' : 'nav-link'} href="/diary" onClick={(event) => { event.preventDefault(); navigate('/diary'); }}>
            Diary <span className="nav-count">{films.length}</span>
          </a>
        </nav>
        <div className={`user-menu-wrap${currentUser ? '' : ' guest-user-menu'}`}>
          {currentUser ? (
            <>
              <button className="button button-primary header-add-button" aria-label="Add a film" onClick={() => openAddFilm('diary')}>
                <Icon name="plus" size={15} /> <span>Add a film</span>
              </button>
              <button className="couple-chip" aria-expanded={showUserMenu} aria-haspopup="menu" onClick={() => setShowUserMenu((visible) => !visible)}>
                <span className="avatar avatar-one">W</span>
                <span className="avatar avatar-two">L</span>
                <span className="couple-name">Will & Lynn</span>
                <span className="couple-dot" />
              </button>
              {showUserMenu && (
                <div className="user-dropdown" role="menu">
                  <span>LOGGED IN AS</span>
                  <strong>{currentUser.name}</strong>
                  <button role="menuitem" onClick={logout}>Log out <Icon name="arrow" size={14} /></button>
                </div>
              )}
            </>
          ) : (
            <>
              <span className="guest-view-label">GUEST VIEW · READ ONLY</span>
              <a className="guest-sign-in" href="/login">Sign in to edit</a>
            </>
          )}
        </div>
      </header>

      <main id="home">
        {sharedDataError && (
          <p className="shared-sync-warning" role="status">
            Shared changes may not be current: {sharedDataError}
          </p>
        )}
        {activeView === 'home' ? (
          <>
            <section className="welcome-section">
              <div className="welcome-copy">
                <h1>Movie nights are<br />better <em>with you.</em></h1>
                <p className="welcome-intro">A little home for the films we watch together —<br className="desktop-break" /> and the moments that happen between them.</p>
                <div className="welcome-actions">
                  {currentUser && (
                    <button className="button button-primary" onClick={saveRecommendation} disabled={!recommendation || recommendationLoading}>
                      <Icon name="plus" size={16} />
                      {recommendation && watchlist.some((film) => film.tmdbId === recommendation.tmdbId) ? 'On your watchlist' : 'Save for later'}
                    </button>
                  )}
                  <button className="another-button" onClick={surpriseUs} disabled={recommendationLoading}>
                    {recommendationLoading ? <span className="button-loader" /> : <Icon name="arrow" size={15} />}
                    {recommendationLoading ? 'Finding a film' : 'Surprise us'}
                  </button>
                </div>
                <span className="since-note"><span className="tiny-heart">♥</span> Since July 2026</span>
              </div>
              <section className={`featured-film ${recommendationLoading ? 'is-loading' : ''} ${recommendation && !recommendation.backdrop && !recommendation.image ? 'poster-no-image' : ''}`} aria-label="Tonight's movie recommendation">
                {recommendationLoading ? (
                  <div className="feature-skeleton" aria-label="Finding a film for tonight" />
                ) : recommendation ? (
                  <>
                    {(recommendation.backdrop || recommendation.image) && (
                      <img src={recommendation.backdrop || recommendation.image} alt="" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement?.classList.add('poster-no-image'); }} />
                    )}
                    <div className="featured-overlay" />
                    <div className="featured-topline">
                      <span>TONIGHT'S LITTLE FEATURE</span>
                    </div>
                    <div className="featured-caption">
                      <span className="featured-kicker">{recommendation.genres?.slice(0, 2).join(' · ') || 'A FILM FOR THE TWO OF YOU'}</span>
                      <h2>{recommendation.title}</h2>
                      <span className="featured-meta">
                        {recommendation.year}
                        {recommendation.director && <> <i>·</i> {recommendation.director}</>}
                        {recommendation.rating && <> <i>·</i> ★ {recommendation.rating}</>}
                      </span>
                      {recommendation.overview && <p className="featured-overview">{recommendation.overview}</p>}
                    </div>
                  </>
                ) : (
                  <div className="recommendation-error">
                    <span className="section-kicker">TONIGHT'S LITTLE FEATURE</span>
                    <h2>We couldn’t find a film just yet.</h2>
                    <p>{recommendationError || 'Check the TMDB connection and try again.'}</p>
                    <button className="button button-primary" onClick={surpriseUs}>Try again <Icon name="arrow" size={15} /></button>
                  </div>
                )}
              </section>
            </section>

            <MemoryStrip
              watchedCount={watchedCount}
              totalMinutes={totalMinutes}
              missingRuntimeCount={missingRuntimeCount}
              runtimeLoading={runtimeLoading}
              averageRating={averageRating}
            />
            {runtimeError && <p className="runtime-error" role="status">Couldn’t load every film runtime: {runtimeError}</p>}
          </>
        ) : activeView === 'watchlist' ? (
          <section className="watchlist-page diary-section">
            <div className="watchlist-intro">
              <span className="section-kicker">A LITTLE SOMETHING FOR LATER</span>
              <h1>For a night <em>in.</em></h1>
              <p>Films we're saving for a night worth remembering.</p>
            </div>
            <div className="section-heading">
              <div className="section-title-group">
                <div className="title-row">
                  <h2>Our watchlist</h2>
                  <span className="film-total">{watchlist.length} SAVED</span>
                </div>
              </div>
              <div className="watchlist-tools">
                {currentUser && (
                  <button className="button button-primary page-add-button" onClick={() => openAddFilm('watchlist')}>
                    <Icon name="plus" size={15} /> Add a film to your watchlist
                  </button>
                )}
                <SearchBox search={search} setSearch={setSearch} />
              </div>
            </div>
            {displayedMovies.length ? (
              <div className="film-grid">
                {displayedMovies.map((film, index) => (
                  <FilmCard
                    key={film.tmdbId}
                    film={film}
                    watched={false}
                    readOnly={isReadOnly}
                    onToggle={(item, action) => action === 'remove-confirmed'
                      ? removeFromWatchlist(item)
                      : toggleWatched(item)}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                message={search ? 'No films found' : 'Your watchlist is a blank page.'}
                actionLabel={!search && watchlist.length === 0 ? 'Add a film to your watchlist' : ''}
                onAction={currentUser && !search && watchlist.length === 0 ? () => openAddFilm('watchlist') : undefined}
              />
            )}
            <div className="bottom-note">
              <div className="note-rule" />
              <span>THE NEXT MOVIE NIGHT</span>
              <span className="note-script">is already looking lovely <span>♥</span></span>
              <div className="note-rule" />
            </div>
          </section>
        ) : (
          <section className="diary-page diary-section">
            <div className="watchlist-intro">
              <span className="section-kicker">THE FILMS THAT STAY WITH YOU</span>
              <h1>Our little <em>diary.</em></h1>
              <p>Every movie night, and the little memories that came with it.</p>
            </div>
            <div className="section-heading diary-page-heading">
              <div className="title-row">
                <h2>Watched together</h2>
                <span className="film-total">{films.length} FILMS</span>
              </div>
              <SearchBox search={search} setSearch={setSearch} />
            </div>
            {displayedMovies.length ? (
              <div className="diary-list">
                {displayedMovies.map((film, index) => (
                  <DiaryEntry key={film.tmdbId || film.id} film={film} readOnly={isReadOnly} index={index} onEdit={editDiaryFilm} onRemove={(item) => {
                    setFilms((current) => current.filter((saved) => saved.tmdbId !== item.tmdbId));
                    setToast(`${item.title} removed from your diary.`);
                  }} />
                ))}
              </div>
            ) : <EmptyState message={search ? 'No films found' : 'Your diary is waiting.'} />}
          </section>
        )}
      </main>

      <footer className="footer">
        <span>TAKE TWO <span className="footer-heart">♥</span> A FILM DIARY</span>
      </footer>
      {showAddFilm && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddFilm(false); }}>
          <section className="add-modal" role="dialog" aria-modal="true" aria-labelledby="add-film-title">
            <button className="modal-close" onClick={() => setShowAddFilm(false)} aria-label="Close">×</button>
            <span className="section-kicker">{addDestination === 'diary' ? 'SAVE A MOVIE NIGHT TO YOUR DIARY' : 'SAVE A LITTLE SOMETHING FOR LATER'}</span>
            <h2 id="add-film-title">{selectedMovie ? selectedMovie.title : addDestination === 'diary' ? 'Add to your diary' : 'Add to your watchlist'}</h2>
            <p>{selectedMovie ? `${selectedMovie.year}${selectedMovie.director ? ` · ${selectedMovie.director}` : ''} · TMDB` : 'Search for a film and choose the right one.'}</p>
            {!selectedMovie ? (
              <div className="movie-picker">
                <label className="movie-query-label" htmlFor="movie-query">Film title</label>
                <div className="movie-query-wrap">
                  <Icon name="search" size={17} />
                  <input
                    id="movie-query"
                    type="search"
                    autoFocus
                    value={movieQuery}
                    onChange={(event) => setMovieQuery(event.target.value)}
                    placeholder="Start typing a title…"
                    autoComplete="off"
                  />
                  {movieSearchLoading && <span className="button-loader" aria-label="Searching" />}
                </div>
                {movieSearchError && <p className="movie-search-note">{movieSearchError}</p>}
                {movieQuery.trim().length > 1 && !movieSearchLoading && !movieSearchError && movieResults.length === 0 && (
                  <p className="movie-search-note">No matching films found. Try another title.</p>
                )}
                {movieResults.length > 0 && (
                  <div className="movie-results" role="listbox" aria-label="Film search results">
                    {movieResults.map((film) => (
                      <button className="movie-result" key={film.tmdbId} onClick={() => chooseMovie(film)} type="button">
                        {(film.image || film.backdrop) && (
                          <img src={film.image || film.backdrop} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
                        )}
                        <span><strong>{film.title}</strong><small>{film.year}{film.director ? ` · ${film.director}` : ''}</small></span>
                        {addDestination === 'watchlist' ? <Icon name="plus" size={17} /> : <Icon name="arrow" size={16} />}
                      </button>
                    ))}
                  </div>
                )}
                {movieResultsPage < movieTotalPages && movieResults.length > 0 && (
                  <button className="movie-load-more" type="button" onClick={loadMoreMovieResults} disabled={movieMoreLoading}>
                    {movieMoreLoading ? 'Loading more films…' : 'Load more results'}
                  </button>
                )}
                {addDestination === 'watchlist' && <p className="movie-picker-footnote">Choosing a film adds it straight to your watchlist. No review needed.</p>}
              </div>
            ) : (
              <form className="film-form review-fields" onSubmit={saveSelectedMovie}>
                <button className="movie-change-button" type="button" onClick={() => { setSelectedMovie(null); setMovieQuery(''); }}>
                  ← Search for a different film
                </button>
                <div className="rating-pair">
                  <div>
                    <label htmlFor="add-will-rating">Will’s rating <span>optional</span></label>
                    <select id="add-will-rating" value={willRating} onChange={(event) => setWillRating(event.target.value)}>
                      <option value="">Not rated</option>
                      {ratingOptions.map((score) => <option key={score} value={score}>{score} / 10</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="add-lynn-rating">Lynn’s rating <span>optional</span></label>
                    <select id="add-lynn-rating" value={lynnRating} onChange={(event) => setLynnRating(event.target.value)}>
                      <option value="">Not rated</option>
                      {ratingOptions.map((score) => <option key={score} value={score}>{score} / 10</option>)}
                    </select>
                  </div>
                </div>
                <label htmlFor="add-will-review">Will’s Review <span>optional</span></label>
                <textarea id="add-will-review" value={willReview} onChange={(event) => setWillReview(event.target.value)} rows="2" placeholder="What will Will remember?" />
                <label htmlFor="add-lynn-review">Lynn’s Review <span>optional</span></label>
                <textarea id="add-lynn-review" value={lynnReview} onChange={(event) => setLynnReview(event.target.value)} rows="2" placeholder="What will Lynn remember?" />
                <label htmlFor="add-shared-memory">One-sentence description <span>optional</span></label>
                <textarea id="add-shared-memory" className="one-sentence-field" value={sharedMemory} onChange={(event) => setSharedMemory(event.target.value)} rows="1" placeholder="In one sentence, what is this film about?" />
                <button className="button button-primary film-form-submit" type="submit">Add to our diary <Icon name="arrow" size={15} /></button>
              </form>
            )}
          </section>
        </div>
      )}
      {activeReviewFilm && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReviewModal(); }}>
          <section className="add-modal review-modal" role="dialog" aria-modal="true" aria-labelledby="review-film-title">
            <button className="modal-close" onClick={closeReviewModal} aria-label="Close">×</button>
            <span className="section-kicker">{editingDiaryFilm ? 'UPDATE A MOVIE NIGHT MEMORY' : 'A MOVIE NIGHT TO REMEMBER'}</span>
            <h2 id="review-film-title">{activeReviewFilm.title}</h2>
            <p>{editingDiaryFilm ? 'Update your ratings and memories. You can leave any of them blank.' : 'Add your ratings and memories. You can leave any of them blank.'}</p>
            <form className="film-form" onSubmit={saveReview}>
              <div className="rating-pair">
                <div>
                  <label htmlFor="review-will-rating">Will’s rating <span>optional</span></label>
                  <select id="review-will-rating" value={willRating} onChange={(event) => setWillRating(event.target.value)}>
                    <option value="">Not rated</option>
                    {ratingOptions.map((score) => <option key={score} value={score}>{score} / 10</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="review-lynn-rating">Lynn’s rating <span>optional</span></label>
                  <select id="review-lynn-rating" value={lynnRating} onChange={(event) => setLynnRating(event.target.value)}>
                    <option value="">Not rated</option>
                    {ratingOptions.map((score) => <option key={score} value={score}>{score} / 10</option>)}
                  </select>
                </div>
              </div>
              <label htmlFor="review-will-memory">Will’s Review <span>optional</span></label>
              <textarea id="review-will-memory" value={willReview} onChange={(event) => setWillReview(event.target.value)} rows="2" placeholder="What did Will think of the film?" />
              <label htmlFor="review-lynn-memory">Lynn’s Review <span>optional</span></label>
              <textarea id="review-lynn-memory" value={lynnReview} onChange={(event) => setLynnReview(event.target.value)} rows="2" placeholder="What did Lynn think of the film?" />
              <label htmlFor="review-shared-memory">One-sentence description <span>optional</span></label>
              <textarea id="review-shared-memory" className="one-sentence-field" value={sharedMemory} onChange={(event) => setSharedMemory(event.target.value)} rows="1" placeholder="In one sentence, what is this film about?" />
              <button className="button button-primary film-form-submit" type="submit">
                {editingDiaryFilm ? 'Save changes' : 'Add to our diary'} <Icon name="arrow" size={15} />
              </button>
            </form>
          </section>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default App;
