# Local end-to-end harness

Runs the real web app in a browser against stand-ins, so features can be checked without the real Supabase or internet.

- `fake-supabase.mjs`: Supabase Auth (password sign-in) + PostgREST (tables and RPC) on port 54321, backed by PGlite running every migration in `backend/supabase/migrations`, with real row-level security. Test login: `andre@example.com` / `correct horse`. `GET /__token` returns the daily job's token.
- `seed.sql`: test data for that user (shopping, albums, books, films, reminders).
- `feed-server.mjs`: a fake university timetable feed at `http://localhost:54400/feed.ics` (lectures this week, a gap that reads as a break) and placeholder covers at `/cover/N.svg`.
- `push/push-server.mjs`: a fake push service on `https://localhost:54500` that records encrypted deliveries. Needs a self-signed `key.pem`/`cert.pem` in `push/` (`openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj "/CN=localhost"`).
- `walk-tasks.mjs`: the Tasks tab, Claude planning study blocks in each autonomy mode, and keeping, moving and skipping them.
- `walk-assistant.mjs`: plays Claude through the connector link (brief, ideas, notes) and checks Today, Lists and Settings → Assistant.
- `walk-*.mjs`: Playwright walk-throughs that print ok/FAIL per step and save screenshots to the folder given as the first argument.

```sh
cd tools/e2e && npm install
node feed-server.mjs & SEED=seed.sql node fake-supabase.mjs ../../backend/supabase/migrations &
cd ../../apps/web
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test pnpm build
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test pnpm start -p 3102 &
node ../../tools/e2e/walk-suggestions.mjs /path/to/screenshots
```

Notes: the walk scripts load Playwright from the globally installed copy (`/opt/node22/lib/node_modules`). Each run should start from a fresh `fake-supabase` (the data is in memory). Headless Chromium always reports notifications as blocked, so the "Turn on" flow can't be clicked through here.
