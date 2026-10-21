# Glactivity 🐿️

Your days, gently organised. Timetable, gym, meals, shopping list, reminders, album of the week and daily games in one calm app, with suggestions instead of a rigid schedule.

See [`docs/PLAN.md`](docs/PLAN.md) for the plan and roadmap.

## Repository

```
apps/web/            Next.js web app (the phone app for now: add it to your home screen)
apps/ios/            SwiftUI app (later)
backend/supabase/    database migrations
backend/tests/       schema and row-level-security tests (in-memory Postgres)
design/              mascot artwork and design tokens
docs/                plan
```

## Develop

Requires Node 20+ and pnpm.

```sh
pnpm install
pnpm dev          # web app on http://localhost:3000
pnpm test         # all tests
pnpm lint
pnpm typecheck
```

## Going live (one-time setup)

1. **Supabase:** create a free project at supabase.com.
   - In the SQL editor, run `backend/supabase/migrations/20261021000000_init.sql`.
   - Authentication → Emails → *Magic Link* template: add `{{ .Token }}` so sign-in emails include a 6-digit code. On iPhone, a link would open in Safari instead of the home-screen app.
2. **Vercel:** import this repository, set the root directory to `apps/web`, and add the environment variables from `apps/web/.env.example`. The values are in Supabase → Project Settings → API.
3. On your iPhone, open the site in Safari → Share → **Add to Home Screen**.
