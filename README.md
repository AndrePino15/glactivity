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

How the pieces fit together: **GitHub** holds the code. **Vercel** builds the code from GitHub and hosts the website. **Supabase** is the database and handles sign-in. The website talks to Supabase using two settings that live in Vercel.

1. **Database:** in Supabase → SQL Editor, run each file in `backend/supabase/migrations/` once, oldest first. A new file means a new step to run.
2. **Your account:** in Supabase → Authentication → Users → *Add user* → *Create new user*, enter your email and a password, and tick *Auto Confirm User*. No emails are ever sent.
3. **Close sign-ups:** in Supabase → Authentication → Sign In / Providers, turn off *Allow new users to sign up*, so yours stays the only account.
4. **Connect Vercel to Supabase:** copy the *Project URL* and the *Publishable key* from Supabase → Project Settings → API (or the *Connect* button). In Vercel → your project → Settings → Environment Variables, add them as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (tick Production and Preview), then **redeploy**. Settings only take effect on the next build.
5. Vercel → Settings → Build and Deployment: the **Root Directory** must be `apps/web`.
6. On your iPhone, open the site in Safari → Share → **Add to Home Screen**, then sign in once.
