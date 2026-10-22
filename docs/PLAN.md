# Glactivity: plan

Glactivity takes some of the planning load off your days: a calendar of everything (lectures, exams, gym, meals, personal events), the small fun things (album of the week, daily games, what you're reading), and the life admin (shopping list, rent and bill reminders). All in one calm place.

## Principles

- **Suggest, don't schedule.** Today offers suggestions you can take, snooze or ignore. Ignoring one costs nothing. No streaks, no guilt.
- **Sense first, ask last.** Learn from the calendar and from what gets ticked off. When input is needed, it takes one tap.
- **Phone first.** Every screen is designed for one-handed iPhone use. The laptop gets a sidebar layout of the same app.
- **Feel like Apple made it.** Clean, quiet UI with few features, each one done properly.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Web app (the phone app for now) | Next.js + TypeScript, installable as a home-screen app | Hosted on Vercel (free). Mobile-first. |
| iPhone / iPad (later) | SwiftUI | Built once a Mac is available. Uses the same backend, so nothing is rebuilt. Free Apple ID only: no paid developer account, Siri or widgets needed. |
| Backend | Supabase (free tier): Postgres, email + password sign-in, scheduled jobs | Row level security on every personal table. |
| Calendars | ICS feeds synced on the server | University of Southampton timetable feed, Outlook (uni account) if publishing is allowed, an exam timetable paste-in. |
| Holidays | gov.uk bank holidays (England) + a public holiday API (Portugal) | Plus a "where am I" switch 🇬🇧/🇵🇹. |
| Content | iTunes Search API, Open Library, TMDB | Album art + Apple Music links, book covers, film posters. |
| Alarm (later) | ESP32 + small display + buzzer | Gets the alarm time and the day's first event from the backend. |

The timetable feed URL is personal and treated as a secret: it's stored in the database behind RLS, never in the repository.

## App structure

1. **Today:** greeting with the squirrel, 2–3 suggestions, the day's timeline (lectures, gym, meals), upcoming reminders, album of the week (cover + title + artist → Apple Music), daily games, current book.
2. **Timetable:** day and week views of every calendar, colour-coded.
3. **Lifestyle:** workout plan with options (gym split, home, run, rest), weekly meal plan that feeds the shopping list.
4. **Fun:** album of the week (history + reroll), daily games launcher with a one-tap "played today", reading and watching.
5. **Lists:** the week's shopping list (instant add; ticked items clear after shopping day), reminders (rent, bills, recurring), movies, books and albums to try. The albums list feeds the weekly pick.

**Term modes:** term, break and exam periods switch the app's behaviour. Breaks are detected from gaps in the timetable feed and confirmed with one tap ("Going to Portugal?"), which switches holidays and suggestions.

## Design

- Day: warm off-white `#F5F3EE`. Night: starry deep navy `#0B1026`. Never pure white or black.
- Follows the phone's light/dark setting by default, with a Day/Night override in Settings.
- SF Pro, rounded cards, one accent colour (chestnut by day, amber by night), lucide line icons.
- Mascot: a squirrel. It stashes things away for later, which is what the app does for you. See `design/`.

## Roadmap

Big features are developed on a branch and merged to `main` at each milestone.

- [x] **Phase 0 – Foundations:** monorepo, design system, light/night themes, installable app, five tab shells + Settings, email + password sign-in, database schema with RLS and tests.
- [ ] **Phase 1 – First version you use daily**
  - Today page with real data
  - Timetable: Southampton ICS feed (refreshed every few hours), exam timetable paste-in
  - Lists: shopping, reminders with notifications, movies/books/albums
  - Fun: album of the week (picked every Monday, Apple Music link, reroll), daily games with "played today"
  - England + Portugal holidays, where-am-I switch, automatic break detection
- [ ] **Phase 2 – Lifestyle:** workout plans and options, meal plan → shopping list, term/break/exam modes driving suggestions.
- [ ] **Phase 3 – Smarter:** rules-based suggestion engine, then an optional Claude daily brief and free-text capture ("gym cancelled, out of eggs").
- [ ] **Phase 4 – SwiftUI app** for iPhone/iPad, plus Apple Health auto-logging of workouts.
- [ ] **Phase 5 – ESP32 alarm** so the phone can stay out of the bedroom.
