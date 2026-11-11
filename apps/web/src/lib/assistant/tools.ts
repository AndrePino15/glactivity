import { addDays } from "../dates";
import { freeTime } from "./freetime";
import { checkSteps } from "./instructions";
import { ruleSuggestions, type AgentContext } from "./rules";

/** Calls a token-guarded database function; the route fills in the secret. */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

type Schema = Record<string, unknown>;
export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  run: (args: Record<string, unknown>, rpc: Rpc) => Promise<unknown>;
};

const DAY = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD" };
const TIME = { type: "string", format: "date-time", description: "ISO 8601 with offset, e.g. 2026-11-17T14:00:00Z" };
const SLOT = { type: "string", enum: ["morning", "evening"] };

const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const overwrite = { ...write, idempotentHint: true };

const object = (properties: Record<string, Schema>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const CHANGE = {
  type: "object",
  description:
    "Optional. What Accept will do. One of: " +
    '{type:"add_event", title, starts_at, ends_at, location?, category? (lecture|exam|gym|meal|social|personal|other)}; ' +
    '{type:"add_shopping_items", items:[string]}; ' +
    '{type:"set_meal", day, slot (lunch|dinner), title}; ' +
    '{type:"add_reminder", title, due_on, recurrence? (none|weekly|monthly|yearly), notify_days_before?}; ' +
    '{type:"add_list_item", list (shopping|movies|books|albums), title, subtitle?}; ' +
    '{type:"add_task", title, due_on?, due_time?, estimate_minutes?, priority? (1 high–3 low), subject?, notes?}. ' +
    "(Study blocks go through plan_blocks, which follows the autonomy setting.)",
  properties: {
    type: { type: "string", enum: ["add_event", "add_shopping_items", "set_meal", "add_reminder", "add_list_item", "add_task"] },
  },
  required: ["type"],
};

export const TOOLS: Tool[] = [
  {
    name: "get_context",
    title: "Read Glactivity",
    description:
      "Everything about the owner's days in one call: today's date and time zone, timetable events, terms/breaks/exams, " +
      "tasks and deadlines with study blocks (and the autonomy setting: suggest, plan or autopilot), " +
      "training plan and log, meal plan and saved meals, reminders, shopping list, what he's reading/watching/listening to, " +
      "games played, feedback on suggestions, the free rules-based suggestions already on Today, and your memory " +
      "(profile, his new notes, what you've learned). Call this first.",
    inputSchema: object({
      days_back: { type: "integer", minimum: 0, maximum: 31, default: 7 },
      days_ahead: { type: "integer", minimum: 0, maximum: 62, default: 7 },
    }),
    annotations: read,
    run: async (args, rpc) => {
      const [ctx, plans] = await Promise.all([
        rpc("agent_context", { days_back: args.days_back ?? 7, days_ahead: args.days_ahead ?? 7 }) as Promise<AgentContext>,
        rpc("agent_plan_context", { days_ahead: Math.max(14, Number(args.days_ahead ?? 7)) }) as Promise<Record<string, unknown>>,
      ]);
      let rules: { title: string; detail: string }[] = [];
      try {
        rules = ruleSuggestions(ctx);
      } catch {
        // The rules are a nice-to-have here; the context still stands.
      }
      return { ...ctx, ...plans, free_suggestions_on_today: rules };
    },
  },
  {
    name: "read_notes",
    title: "Read memory",
    description: "Just the memory: your profile of the owner, his new and filed notes, and what you've learned.",
    inputSchema: object({}),
    annotations: read,
    run: async (_args, rpc) => ((await rpc("agent_context", { days_back: 0, days_ahead: 0 })) as { memory: unknown }).memory,
  },
  {
    name: "write_note",
    title: "Remember something",
    description:
      'kind "learned": a pattern you noticed (short, specific, seen more than once). kind "inbox": something the owner told you ' +
      "in a chat that later runs should plan around (a deadline, a trip, a preference). Returns the note id.",
    inputSchema: object(
      { kind: { type: "string", enum: ["learned", "inbox"] }, body: { type: "string", maxLength: 1000 } },
      ["kind", "body"],
    ),
    annotations: write,
    run: (args, rpc) => rpc("agent_write_note", { kind: args.kind, body: args.body }),
  },
  {
    name: "update_note",
    title: "Update a note",
    description:
      'Rewrite a note (body), or file one of the owner\'s inbox notes once you\'ve taken it into account (status "used"). Notes are never deleted by you; the owner can delete them in Settings.',
    inputSchema: object(
      { id: { type: "string", format: "uuid" }, body: { type: "string", maxLength: 1000 }, status: { type: "string", enum: ["new", "used"] } },
      ["id"],
    ),
    annotations: overwrite,
    run: (args, rpc) => rpc("agent_update_note", { note_id: args.id, body: args.body ?? null, status: args.status ?? null }),
  },
  {
    name: "set_profile",
    title: "Rewrite the profile",
    description:
      "Replace your one-page profile of the owner: habits, best focus times, how long things really take, what works and what doesn't. Keep it short (under ~300 words).",
    inputSchema: object({ body: { type: "string", maxLength: 4000 } }, ["body"]),
    annotations: overwrite,
    run: async (args, rpc) => {
      await rpc("agent_set_profile", { body: args.body });
      return { saved: true };
    },
  },
  {
    name: "set_brief",
    title: "Write the brief",
    description: "Set the short brief shown at the top of Today for a day's morning or evening (replaces any earlier one). 2–4 calm sentences.",
    inputSchema: object({ day: DAY, slot: SLOT, text: { type: "string", maxLength: 1200 } }, ["day", "slot", "text"]),
    annotations: overwrite,
    run: async (args, rpc) => {
      await rpc("agent_set_brief", { day: args.day, slot: args.slot, body: args.text });
      return { saved: true };
    },
  },
  {
    name: "add_suggestions",
    title: "Suggest ideas",
    description:
      "Propose 1–3 ideas for a day. They appear on Today with Accept / Dismiss; nothing changes until the owner accepts. " +
      "This is how scheduled runs make changes. Skip anything the free suggestions already cover.",
    inputSchema: object(
      {
        day: DAY,
        items: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: object(
            { title: { type: "string", maxLength: 120 }, detail: { type: "string", maxLength: 500 }, change: CHANGE },
            ["title"],
          ),
        },
      },
      ["day", "items"],
    ),
    annotations: write,
    run: (args, rpc) => rpc("agent_add_suggestions", { day: args.day, items: args.items }),
  },
  {
    name: "log_run",
    title: "Log what you did",
    description: 'One line for the owner\'s activity log at the end of a check, e.g. "Morning check: brief, 2 suggestions, filed 1 note".',
    inputSchema: object({ summary: { type: "string", maxLength: 500 } }, ["summary"]),
    annotations: write,
    run: async (args, rpc) => {
      await rpc("agent_log", { summary: args.summary, detail: {} });
      return { logged: true };
    },
  },
  {
    name: "add_shopping_items",
    title: "Add to shopping",
    description: "Chat only, when the owner asks you himself: add items to his shopping list now (skips ones already on it). Scheduled runs use add_suggestions instead.",
    inputSchema: object({ items: { type: "array", minItems: 1, maxItems: 30, items: { type: "string", maxLength: 200 } } }, ["items"]),
    annotations: write,
    run: (args, rpc) => rpc("agent_add_shopping_items", { items: args.items }),
  },
  {
    name: "add_event",
    title: "Add to timetable",
    description:
      "Glactivity is the owner's main calendar: when he asks to add something to his calendar, timetable or diary, use this, " +
      "not another calendar, unless he names a different one. Chat only (he is asking you himself); scheduled runs use add_suggestions instead.",
    inputSchema: object(
      {
        title: { type: "string", maxLength: 200 },
        starts_at: TIME,
        ends_at: TIME,
        location: { type: "string", maxLength: 200 },
        category: { type: "string", enum: ["lecture", "exam", "gym", "meal", "social", "personal", "other"], default: "personal" },
        all_day: { type: "boolean", default: false },
      },
      ["title", "starts_at", "ends_at"],
    ),
    annotations: write,
    run: (args, rpc) =>
      rpc("agent_add_event", {
        title: args.title,
        starts_at: args.starts_at,
        ends_at: args.ends_at,
        location: args.location ?? null,
        category: args.category ?? "personal",
        all_day: args.all_day ?? false,
      }),
  },
  {
    name: "add_reminder",
    title: "Add a reminder",
    description: "Chat only, when the owner asks you himself: add a reminder (rent, bills, renewals) now. Scheduled runs use add_suggestions instead.",
    inputSchema: object(
      {
        title: { type: "string", maxLength: 200 },
        due_on: DAY,
        recurrence: { type: "string", enum: ["none", "weekly", "monthly", "yearly"], default: "none" },
        notify_days_before: { type: "integer", minimum: 0, maximum: 30, default: 3 },
      },
      ["title", "due_on"],
    ),
    annotations: write,
    run: (args, rpc) =>
      rpc("agent_add_reminder", {
        title: args.title,
        due_on: args.due_on,
        recurrence: args.recurrence ?? "none",
        notify_days_before: args.notify_days_before ?? 3,
      }),
  },
  {
    name: "find_free_time",
    title: "Find free time",
    description:
      "Free stretches for study over the next days (UK time), clear of lectures and other events, training, meals (12:30–13:30, 19:00–20:00) " +
      "and blocks already placed, inside the study day (weekdays 08:30–21:30, weekends 10:00–18:00). Also gives room_minutes: how much more " +
      "study fits comfortably that day (about 5 h on weekdays, 3 h at weekends, minus what's planned). Respect the owner's own preferences from memory over these defaults.",
    inputSchema: object({ days: { type: "integer", minimum: 1, maximum: 14, default: 7 } }),
    annotations: read,
    run: async (args, rpc) => {
      const days = Math.min(Math.max(Number(args.days ?? 7), 1), 14);
      const [ctx, plans] = await Promise.all([
        rpc("agent_context", { days_back: 0, days_ahead: days }) as Promise<AgentContext>,
        rpc("agent_plan_context", { days_ahead: days }) as Promise<{ blocks: { starts_at: string; ends_at: string; status: string }[] }>,
      ]);
      return {
        time_zone: ctx.timezone,
        days: freeTime({
          days: Array.from({ length: days }, (_, i) => addDays(ctx.today, i)),
          timeZone: ctx.timezone || "Europe/London",
          now: new Date(ctx.now),
          events: ctx.events,
          blocks: plans.blocks,
          training: ctx.training_plan,
        }),
      };
    },
  },
  {
    name: "plan_blocks",
    title: "Place study blocks",
    description:
      "Put study blocks for open tasks into free time (use find_free_time first). Follows the owner's autonomy setting automatically: " +
      "suggest → they become suggestions on Today; plan (default) → pencilled in as tentative blocks he can keep, move or skip; " +
      "autopilot → booked. Blocks of 30 min–2 h with breaks between, finished comfortably before the deadline, harder work in his best focus times. " +
      "Refuses clashes and explains them, so you can adjust.",
    inputSchema: object(
      {
        blocks: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: object(
            { task_id: { type: "string", format: "uuid" }, starts_at: TIME, ends_at: TIME, note: { type: "string", maxLength: 300 } },
            ["task_id", "starts_at", "ends_at"],
          ),
        },
      },
      ["blocks"],
    ),
    annotations: write,
    run: (args, rpc) => rpc("agent_plan_blocks", { blocks: args.blocks }),
  },
  {
    name: "withdraw_blocks",
    title: "Take back study blocks",
    description:
      "To re-plan: take back future blocks you placed that are still tentative (or, on autopilot, that you booked). Blocks the owner kept or added himself are never changed.",
    inputSchema: object({ ids: { type: "array", minItems: 1, items: { type: "string", format: "uuid" } } }, ["ids"]),
    annotations: overwrite,
    run: (args, rpc) => rpc("agent_withdraw_blocks", { block_ids: args.ids }),
  },
  {
    name: "add_task",
    title: "Add a task",
    description:
      "Add a task or deadline (coursework, applications, admin) with an estimate of the hours it really takes. Use it when the owner asks in a chat, " +
      "or in a check only when autonomy is autopilot; otherwise propose it with add_suggestions (change type add_task).",
    inputSchema: object(
      {
        title: { type: "string", maxLength: 200 },
        due_on: DAY,
        due_time: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "HH:MM, UK time" },
        estimate_minutes: { type: "integer", minimum: 0, maximum: 6000 },
        priority: { type: "integer", minimum: 1, maximum: 3, default: 2, description: "1 high, 2 normal, 3 low" },
        subject: { type: "string", maxLength: 80, description: "Module or subject" },
        notes: { type: "string", maxLength: 2000 },
      },
      ["title"],
    ),
    annotations: write,
    run: (args, rpc) =>
      rpc("agent_add_task", {
        title: args.title,
        due_on: args.due_on ?? null,
        due_time: args.due_time ?? null,
        estimate_minutes: args.estimate_minutes ?? null,
        priority: args.priority ?? 2,
        subject: args.subject ?? null,
        notes: args.notes ?? null,
      }),
  },
  {
    name: "update_task",
    title: "Update a task",
    description:
      "Change a task when the owner asks (new deadline, estimate, priority), or mark it done or dropped (which takes back its future blocks). Only the fields given change.",
    inputSchema: object(
      {
        id: { type: "string", format: "uuid" },
        title: { type: "string", maxLength: 200 },
        due_on: DAY,
        due_time: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
        estimate_minutes: { type: "integer", minimum: 0, maximum: 6000 },
        priority: { type: "integer", minimum: 1, maximum: 3 },
        subject: { type: "string", maxLength: 80 },
        notes: { type: "string", maxLength: 2000 },
        status: { type: "string", enum: ["open", "done", "dropped"] },
      },
      ["id"],
    ),
    annotations: overwrite,
    run: (args, rpc) =>
      rpc("agent_update_task", {
        task_id: args.id,
        title: args.title ?? null,
        due_on: args.due_on ?? null,
        due_time: args.due_time ?? null,
        estimate_minutes: args.estimate_minutes ?? null,
        priority: args.priority ?? null,
        subject: args.subject ?? null,
        notes: args.notes ?? null,
        status: args.status ?? null,
      }),
  },
  {
    name: "get_run_steps",
    title: "How to do a check",
    description: "The steps of a Glactivity morning or evening check, for when the owner asks you to \"do my Glactivity check\".",
    inputSchema: object({ slot: SLOT }, ["slot"]),
    annotations: read,
    run: async (args) => ({ steps: checkSteps(args.slot === "evening" ? "evening" : "morning") }),
  },
];
