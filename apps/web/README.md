# Glactivity web

The Next.js app. It's the phone app for now: open it in Safari, tap Share → **Add to Home Screen**, and it runs full-screen like a native app.

```sh
pnpm install          # from the repo root
pnpm dev              # http://localhost:3000
pnpm test             # unit tests
pnpm lint && pnpm typecheck
```

Without Supabase settings the app runs in **preview mode**: every screen works but nothing is saved. To connect it, copy `.env.example` to `.env.local` and fill in the two values.

## Layout

- `src/app/(app)/`: the five tabs (Today, Timetable, Lifestyle, Fun, Lists) and Settings, sharing the tab bar / sidebar shell
- `src/app/login/`: email + password sign-in (the account is created in Supabase; sign-ups are closed)
- `src/components/`: navigation, the squirrel, shared UI pieces
- `src/lib/`: theme, greeting, navigation and Supabase helpers
- `src/proxy.ts`: refreshes the session and sends signed-out visitors to `/login` (Next 16's replacement for middleware)
