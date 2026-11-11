# Claude agent for Glactivity (Phase 3, part 2) — agreed design

Agreed with the owner on 11 Nov 2026. Replaces the paid "Claude API" plan: the agent runs on the owner's Claude subscription through a **scheduled task** that uses a **Glactivity MCP connector**. No Anthropic API key, no API credit.

## Goals

- A short morning/evening brief and a few smarter suggestions on Today, on top of the free rules-based "For today" (`apps/web/src/lib/suggestions.ts`), which must keep working on its own.
- It **learns the owner's habits** over time.
- The same connector works in a normal Claude chat on the phone ("add eggs to my shopping list", "what's my week like?"), which replaces the paid free-text capture idea.
- Principle from the start of the project: **suggest, don't impose.** Nothing the agent proposes changes the owner's data until he taps to accept it. (May be relaxed later for low-risk things like shopping items; not now.)

## Pieces

1. **Glactivity MCP server**: an endpoint on the site (`https://glactivity.vercel.app/api/mcp`), added once as a custom connector at claude.ai/customize/connectors. Safe, narrow tools only, **no deletes**:
   - `get_context(days_back?, days_ahead?)`: schedule, holidays, mode (exams / break / in Portugal), training plan + recent logs, meal plan, reminders due, shopping list, current book / film / album, today's free-rule suggestions, recent suggestion feedback (done / dismissed), and the agent's own notes.
   - `read_notes` / `write_note` / `update_note`: the agent's memory (see below).
   - `set_brief(day, text)`: one short brief per day slot (morning / evening), shown on Today.
   - `add_suggestions(day, items[])`: title, detail, optional proposed change. Proposed changes are typed: `add_event`, `add_shopping_items`, `set_meal`, `add_reminder`, `add_list_item`. They appear on Today as cards with **Accept** / **Dismiss**; Accept applies the change in the app with the user's own session (row-level security applies).
   - Chat-only convenience tools when the owner talks to Claude directly may write straight away (he is the one asking), e.g. `add_shopping_items`, `add_event`, `add_reminder`. Scheduled runs must use `add_suggestions` instead.
   - Authentication: work out what claude.ai custom connectors support (OAuth vs no auth). If only no-auth, protect the endpoint with a long secret in the URL path, stored in the database like the push token, never in the repository or chat. Whatever the method, the server acts only for the owner's account.
2. **Memory that learns**: a notes table the agent reads at the start of every run and updates at the end ("Usually trains around 18:00", "Dismisses 'see friends' on weeknights, accepts on Fridays", "Plans pasta most Wednesdays"). Signals already in the database: suggestion feedback, workout logs, meal plans, game plays, list changes. Settings gets **"What Glactivity has learned"**: the owner can read and delete each note.
3. **Scheduled task** on the owner's account: **Claude Sonnet 5.5** (medium effort if it can be set), **07:00 and 18:00 UK time**, a **fresh session each run** (memory lives in the database, not the chat), connector attached. If scheduled runs can be placed in a claude.ai Project, put them in a "Glactivity" project to keep them out of normal chats. The run's prompt: read context + notes → write brief and up to 3 suggestions that the free rules don't already cover → update notes. Short and calm, never guilt, British English.
4. **"Run now" button** on Today: start the same run on demand. Only if the scheduled task can be triggered from outside (a private trigger URL/token the app can call server-side). If not possible, document the fallbacks: "Run now" from the task in the Claude app, or ask Claude in chat to "do my Glactivity check".

## Extended scope (agreed 11 Nov 2026, after the first draft)

The owner wants a **personal assistant** that manages his time, not only suggestions. Add:

5. **How the assistant is organised** (explain it this way to the owner):
   - **Memory = the Glactivity database.** The only permanent part. Every run or chat is a fresh Claude that reads memory first and writes back what it learned.
   - **Brain = Claude on the owner's subscription** (scheduled runs, and any Claude chat with the connector enabled).
   - **Hands = the Glactivity connector** (MCP tools).
   - Scheduled runs can't read the owner's other Claude chats or Claude's own memory, so **Glactivity is the shared brain**: normal chats save deadlines, plans and context into Glactivity through the connector; the agent reads it all from there.
6. **"Tell your assistant" inbox**: a box in the app (Today, and the Lists hub) where the owner types context ("dentist next Tuesday afternoon", "train in the mornings this month"). Stored as a note marked **new**; the next run reads it, plans around it, and files it (marks it used, or folds it into the profile). Chats can add notes through the connector too.
7. **Memory layout**:
   - **Owner's notes** (inbox, new/used).
   - **Profile of the owner**: one short document the agent rewrites as it learns (habits, best focus times, how long things really take, what works and what doesn't). Kept small on purpose. Readable and editable in Settings → "What Glactivity has learned".
   - **Plans and history**: events, tasks, work blocks done/skipped, suggestion feedback (already exists), workout/meal history.
   - **Activity log**: every run records what it changed and why; shown in the app so the owner can see what the assistant did.
8. **Tasks and deadlines**: title, due date, estimated hours, priority, optional module/subject, progress. Added from the app, from any chat, or by the agent from context.
9. **Planner**: the agent places **work blocks** for tasks into real free time, around lectures, exams, training, meals and sleep, respecting deadlines, and re-plans when things change. Blocks show on Today and in the Timetable.
10. **Learning durations**: when a block ends, one tap: **Done** / **Needed more** / **Didn't do it**. Actual time feeds the profile ("underestimates essays by ~40%", "focuses best in the mornings") and future estimates.
11. **Autonomy setting** (Settings), changeable any time:
    - **Suggest**: proposals only; nothing changes until accepted.
    - **Plan** (**default**): the agent puts work blocks into the timetable as **tentative**; the owner can move, skip or accept them; it adapts.
    - **Autopilot**: books things directly and reports what it did.
    The "suggest, don't impose" rule above applies in Suggest mode and to anything outside work blocks (events with other people, meals, shopping) in Plan mode.
12. **Each run's pipeline**: read memory and new notes → learn from yesterday (what got done, actual durations) → plan (blocks before deadlines) → brief and suggestions → write the activity log and update the profile.
13. **Budget**: no Anthropic API. Everything runs on the owner's subscription. Only if "Run now" cannot trigger the scheduled task, a tiny API budget (owner's cap: £5/month) may be proposed for that one feature, with his approval.

Build this in stages, each verified and shipped before the next: (a) connector + memory + inbox + activity log; (b) tasks, planner, autonomy; (c) duration learning and profile; (d) scheduled task + "Run now".

## Constraints

- Follow `CLAUDE.md` (agree on features first; merge to `main` at milestones) and `design/README.md` (clean, no boxes for their own sake, sections only when they have content).
- Database changes as new files in `backend/supabase/migrations`, with tests in `backend/tests` (PGlite), applied to the Supabase project `lldiksipcnudhtzmgslu` through the Supabase connector. Every new table: row-level security; anything callable without a signed-in user must be token-guarded (see `20261105000000_phase2.sql` for the pattern). Run Supabase's security advisors after.
- Verify in a browser with `tools/e2e` before shipping.
