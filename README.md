# take-two

A private film diary for Will and Lynn: watched-together memories, a shared
watchlist, and a film recommendation for tonight.

## Run locally

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` and add your TMDB API Read Access Token:

```sh
TMDB_API_READ_ACCESS_TOKEN=your_read_access_token
```

Get the token from your TMDB account's API settings. The Express API reads this
server-side value and proxies movie searches and recommendations, so the token
is not included in the browser bundle. Never commit `.env` or put the token in a
`VITE_` variable.

The app protects `/home`, `/watchlist`, and `/diary` with its prototype login
and redirects unauthenticated users to `/login`. Sign-in and diary data remain
local to the current browser; they are not synced between Will's and Lynn's
devices.

The signed-in navigation includes Home, Watchlist, and Diary. Add a film from
the header to save a title directly to either list; on the Watchlist, select a
film to add a rating, mood, and review before saving it to the Diary. Diary
entries can be edited or removed from the Diary page.

Movie search uses paginated results from TMDB's global movie catalog. Home
recommendations are sampled from TMDB and exclude films already in the diary or
watchlist. Add `.env` configuration before searching or requesting a
recommendation; the app reports a setup error instead of showing sample
recommendations when TMDB is unavailable. Adding a film
from the header asks for Will's and Lynn's optional ratings and reviews plus
one shared memory. Adding from the Watchlist only saves the selected film;
hearting a watchlist entry opens that same review form before moving it into
the Diary.

## Production build

```sh
npm run build
npm start
```

Open `http://localhost:3001`. The Express server serves the production build
and the `/api` movie endpoints from the same origin. Set
`TMDB_API_READ_ACCESS_TOKEN` in the server environment before starting it.

To publish this prototype, push the source to GitHub and connect the repository
to a Node web-service host. Use `npm install && npm run build` as the build
command and `npm start` as the start command, then add
`TMDB_API_READ_ACCESS_TOKEN` as a private environment variable in the host's
settings. Do not commit `.env`.

Publishing the source or deploying the site does **not** publish diary entries
stored in a browser. Each browser keeps its own local copy, and the current
prototype login is not real authentication. For Will and Lynn to share entries
across devices, the next step is a persistent database and real authenticated
accounts; do not use the prototype credentials as production security.
