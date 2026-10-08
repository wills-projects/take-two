# Take Two

A private shared film diary for Will and Lynn: watched-together memories, a
shared watchlist, and a film recommendation for tonight.

## Shared storage and sign-in

The diary and watchlist are stored together in Supabase Postgres. Both accounts
read and update the same record; open pages refresh from the server every 10
seconds. Saves use a database revision check, so concurrent edits to different
films are merged rather than allowing a stale page to overwrite the latest
collection. The first successful sign-in initializes the shared record from
the current browser's saved lists (or the starter lists if none exist).

Sign-in is handled by the server and uses an HTTP-only, signed session cookie.
User passwords, the session signing secret, and the Supabase service-role key
must only be configured as server environment variables; they are never sent to
the browser.

### Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
   It creates the shared collection table and its revision-checked save
   function. Row-level security is enabled without public access policies.
3. Copy the project's URL and `service_role` key from **Project Settings > API**.
   Never use the service-role key in a `VITE_` variable or expose it in
   client-side code.
4. Configure the environment variables below in Vercel. To retain the current
   prototype credentials, set both passwords to `test123`; change them to
   private passwords before relying on the deployed site.
5. Redeploy after changing environment variables.

The first browser that signs in after setup imports its existing local diary and
watchlist into the new shared record. Confirm that this is the browser with the
most complete lists before the first sign-in. Later sign-ins load the canonical
Supabase version; browser-local data is no longer used for ongoing saves.

## Run locally

```sh
npm install
npm run dev
```

On Windows, first copy the template with `Copy-Item .env.example .env`.
Then fill in `.env` with the server values:

```env
TMDB_API_READ_ACCESS_TOKEN=your_tmdb_read_access_token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SESSION_SECRET=at_least_32_random_characters
WILL_EMAIL=williampaullee@gmail.com
WILL_PASSWORD=your_private_password
LYNN_EMAIL=xulynn19@gmail.com
LYNN_PASSWORD=your_private_password
```

Generate a session secret locally with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`npm run dev` starts the Express API and Vite. The API reads all credentials
server-side. Do not commit `.env`.

## Vercel deployment

Import the repository into Vercel with the project root set to `./`. Vite's
build command is `npm run build`, and its output directory is `dist`; the
Vercel project should detect these defaults. `api/[...path].js` exposes the
existing Express API routes as a Vercel Function, while `vercel.json` routes
client-side pages such as `/login`, `/home`, `/watchlist`, and `/diary` to the
Vite app.

Set these **server-side** environment variables for Production (and Preview or
Development if you use those environments):

- `TMDB_API_READ_ACCESS_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `WILL_EMAIL`
- `WILL_PASSWORD`
- `LYNN_EMAIL`
- `LYNN_PASSWORD`

Redeploy after setting or changing the variables. The Supabase SQL setup must
also be completed once per project. If the app reports that shared storage is
not configured, check the Vercel deployment's function logs and confirm that
the Supabase URL, service-role key, and schema/function are present.

## Production build and standalone Node server

```sh
npm run build
npm start
```

Open `http://localhost:3001`. The Express server serves the Vite build and API
from one origin. Configure the same server-side environment variables used by
Vercel.
