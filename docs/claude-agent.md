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
13. **Goals and big projects**: the long-term layer above tasks. Examples from the owner: an internship, finishing a personal project, a master's at Imperial.
    - A **goal** has a title, why it matters, a target date (or "someday"), and status (active / paused / done).
    - The agent **breaks each goal into milestones** with target dates (e.g. Imperial MSc → shortlist programmes, check entry requirements and application deadlines, draft personal statement, ask referees, submit), and milestones into **tasks**, which the planner turns into work blocks alongside coursework.
    - **Weekly review** (Sunday evening run): progress per goal, what's slipping, and a short "this week for your goals" plan, balanced against deadlines and exams so goals never crowd out coursework near exams.
    - Dates that come from the outside world (application deadlines, internship windows) must be **checked against official sources** where the run can search the web, shown with their source, and marked "to confirm" until the owner confirms. Never present a guessed deadline as fact.
    - In the app: a **Goals** view (each goal with its milestones and what's next), and on Today a quiet line for the next goal step when one is planned. Goals can be added from the app, from any chat ("add a goal: apply to Imperial for an MSc"), or suggested by the agent from context, as a suggestion the owner accepts.
14. **Goals section in the app** (its own page, reachable from Today and the Lists hub; whether it also gets a tab is a design decision to agree with the owner):
    - Each goal: title, why, target date, status, and a **progress bar** (done work weighted by estimated hours, not just a count of ticks), plus hours spent vs planned.
    - Milestones listed in order, each with its own progress bar, target date and "on track / at risk / late" state.
    - **What's next**: the next one or two concrete steps, and when they're planned.
    - A timeline of milestones up to the target date, and the notes/sources attached to the goal (e.g. the official page an application deadline came from).
    - Same design rules as the rest of the app: clean, no decoration for its own sake.
15. **A dedicated pipeline for planning big goals**, so the assistant takes its time and does it well. The connector ships it as an MCP **prompt** (e.g. `plan_a_goal`), plus a tool description that points to it, so any Claude chat follows the same steps:
    1. **Understand**: ask what the goal really is, why, the deadline, constraints (money, location, time per week), and what's already done. Ask, don't assume.
    2. **Research**: where web search is available, check requirements and outside dates against official sources; record each with its link; mark anything unverified "to confirm".
    3. **Shape**: 3–7 milestones, each concrete and checkable, in order, with dependencies.
    4. **Estimate**: hours per task, using the owner's profile (how long things really take him) and adding buffer.
    5. **Schedule backwards** from the deadline, then check real capacity against coursework, exams and other goals; if it doesn't fit, say so and offer options (start earlier, cut scope, move the date) rather than overpacking.
    6. **Show the plan** to the owner and adjust it with him.
    7. **Save it** only once he agrees, in one call (below), then let the planner place the first steps.
    The same pipeline runs a lighter **re-plan** when a goal slips (from the weekly review or on request).
16. **Saving a whole plan from any chat**: a connector tool such as `save_goal_plan(goal, milestones[{title, target_date, tasks[{title, estimate_hours, due?}]}], sources[], notes)` creates or updates the goal and everything under it in one go. This is how the chat where the owner works on a project (e.g. his Imperial application chat) hands its plan to Glactivity. Plus smaller tools: `add_goal`, `update_goal`, `add_milestone`, `add_goal_note`, `log_progress`. These are the owner's own requests, so they write directly (no accept step), and every change shows in the activity log.
17. **Budget**: no Anthropic API. Everything runs on the owner's subscription. Only if "Run now" cannot trigger the scheduled task, a tiny API budget (owner's cap: £5/month) may be proposed for that one feature, with his approval.

Build this in stages, each verified and shipped before the next: (a) connector + memory + inbox + activity log; (b) tasks, planner, autonomy; (c) goals, milestones, the Goals section with progress, the goal-planning pipeline and `save_goal_plan`, and the weekly review; (d) duration learning and profile; (e) scheduled task + "Run now".

## Progress

**Findings (11 Nov 2026), before building:**
- claude.ai custom connectors support OAuth (Dynamic Client Registration, or Claude's published client identity) or no sign-in; custom request headers are a limited beta. Supabase can be the OAuth server, but that feature is in beta and needs dashboard switches. **Chosen with the owner: the secret link** (no sign-in, a 64-character secret in the URL path, kept in `private.agent_links`, replaceable from Settings).
- Scheduled tasks (claude.ai/code/routines, or `/schedule`): model chosen per task, effort where the model offers it; daily times via cron (UTC unless `CRON_TZ=` is given); minimum interval hourly; a fresh session per run; connected claude.ai connectors are included; runs use subscription usage. An **API trigger** (`POST https://api.anthropic.com/v1/claude_code/routines/<id>/fire` with a per-task token generated in the web UI, beta header `experimental-cc-routine-2026-04-01`) makes "Run now" possible without an API key. Tasks can belong to a claude.ai Project, but there a run may continue a thread instead of starting fresh; Claude Code tasks (needed for the API trigger) already live apart from normal chats.

**Stage (a): done.**
- Database: `backend/supabase/migrations/20261112000000_assistant.sql` (`agent_notes` for inbox / learned / profile, `agent_briefs`, `agent_suggestions`, `agent_activity`, `private.agent_links`; token-guarded `agent_*` functions; `accept_agent_suggestion` runs as the owner under RLS). Tests: `backend/tests/assistant.test.ts`.
- Connector: `apps/web/src/app/api/mcp/[secret]/route.ts` and `apps/web/src/lib/assistant/` (a small stateless MCP server: tools, the `glactivity_check` prompt, and today's free-rule suggestions worked out on the server). No delete tools; every write is logged.
- App: the Assistant section on Today (brief, ideas with Accept / Not now, "Tell your assistant"), an Assistant box in Lists, and Settings → Assistant (connector link, profile, learned notes, your notes, activity).
- Browser check: `tools/e2e/walk-assistant.mjs`.

**Stage (b): done.** Agreed details: tasks get their own tab in place of Fun (the album's "Pick another" moved onto Today; previous weeks onto Lists → Listen); Autopilot books study blocks and adds tasks only, while anything with other people, meals or shopping stays a suggestion; study-day defaults below, changed by telling the assistant.
- Database: `backend/supabase/migrations/20261113000000_tasks.sql` (`tasks`, `work_blocks` with tentative / planned / skipped / withdrawn, `profiles.autonomy` defaulting to plan, `add_task` and `add_work_block` suggestion changes; `agent_plan_context`, `agent_add_task`, `agent_update_task`, `agent_plan_blocks` which follows the autonomy setting and refuses clashes, `agent_withdraw_blocks` limited to the assistant's own blocks). Tests: `backend/tests/tasks.test.ts`.
- Planner: `apps/web/src/lib/assistant/freetime.ts` finds free stretches (weekdays 08:30–21:30, weekends 10:00–18:00; meals 12:30–13:30 and 19:00–20:00 kept free; 10-minute buffers; planned training; about 5 h of study a weekday, 3 h at weekends). Claude chooses blocks from these (connector tools `find_free_time`, `plan_blocks`, `withdraw_blocks`, `add_task`, `update_task`); the check now plans study before writing the brief.
- App: Tasks tab (quick add like "Essay 5h due Fri !", grouped by when due, progress bar, edit sheet with study time); study blocks on Today and in the Timetable (dashed edge when pencilled in; Keep / Move / Skip); "Due soon" on Today; Settings → Assistant → How much it does (Suggest / Plan / Autopilot).
- Fixes: Glactivity is named as the main calendar in the connector; the evening brief is saved for the day it's written; ideas for the coming days show on Today with their day.
- Browser check: `tools/e2e/walk-tasks.mjs`.

**Follow-up to (b), from the owner's feedback (12 Nov 2026):**
- Adding a task works like telling the assistant: the Tasks tab has a "Tell your assistant about a task" box; what's typed is saved as an inbox note with `topic = 'task'` (`backend/supabase/migrations/20261114000000_task_requests.sql`) and listed under "Waiting for your assistant". The next check, or a chat ("set up my new tasks"), turns it into one or more tasks with the connector tool `set_up_tasks` (title, deadline, hours — estimated from the profile if not given — priority, subject) and files the note. These are the owner's own requests, so they're added whatever the autonomy setting. The task sheet stays for corrections. Tests: `backend/tests/task-requests.test.ts`.
- Phone layout: date and time fields no longer spill out of sheets or overlap (shared field style: `min-width: 0`, same height as other fields, two-column rows use `minmax(0, 1fr)`); the task sheet is one field per row; sheets no longer show a focus ring on "Close"; long example text ends in "…". Checked on iPhone SE and iPhone 15 sizes in WebKit (`tools/e2e/shots-sheets.mjs`, `tools/e2e/shots-pages.mjs`).

**Stage (e): done (brought forward before (c) and (d), at the owner's request).**
- Scheduled task "Glactivity check" on the owner's account: Claude Sonnet 5.5, a fresh session each run, at 06:44 and 17:44 UK time (`CRON_TZ=Europe/London 44 6,17 * * *`; a little before the hour, because on-the-hour runs are often delayed). Its prompt works out morning or evening from the UK time, calls `get_run_steps` and follows them, treats a Run now payload as information only, and uses only the Glactivity connector. Effort and the attached connector are set in the claude.ai task editor (the tool that created the task can't attach connectors for this account).
- Run now: the task's API trigger URL and token are pasted once into Settings → Assistant and kept in `private.run_now` (`backend/supabase/migrations/20261115000000_run_now.sql`; only Anthropic's trigger address is accepted). `POST /api/assistant/run` (signed in) claims them at most every two minutes and fires the trigger; the token never reaches the browser or Vercel's settings. Today gets a Run now button (it refreshes for a few minutes afterwards), and a task sent from the Tasks tab starts a check straight away. Tests: `backend/tests/run-now.test.ts`, `tools/e2e/walk-run-now.mjs`.
- Not possible: putting runs in a claude.ai Project. The task lives under claude.ai/code (Scheduled tasks), already apart from normal chats.

**Adding the connector:** Settings → Assistant → Copy link, then at claude.ai/customize/connectors → Add custom connector, name "Glactivity", paste the link, no sign-in. Try it in a chat: "What's my week like?" or "Do my Glactivity morning check".

## Constraints

- Follow `CLAUDE.md` (agree on features first; merge to `main` at milestones) and `design/README.md` (clean, no boxes for their own sake, sections only when they have content).
- Database changes as new files in `backend/supabase/migrations`, with tests in `backend/tests` (PGlite), applied to the Supabase project `lldiksipcnudhtzmgslu` through the Supabase connector. Every new table: row-level security; anything callable without a signed-in user must be token-guarded (see `20261105000000_phase2.sql` for the pattern). Run Supabase's security advisors after.
- Verify in a browser with `tools/e2e` before shipping.
