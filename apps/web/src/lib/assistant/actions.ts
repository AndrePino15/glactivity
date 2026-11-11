"use client";

import { refresh, write } from "@/lib/db/client";
import type { AgentChange } from "@/lib/db/types";

/** Tells the assistant something; its next check reads it. */
export async function tellAssistant(body: string) {
  await write((db) => db.from("agent_notes").insert({ kind: "inbox", body, status: "new" }));
  await refresh("agent-notes");
}

/** Describes a task in your own words; the assistant sets it up (set_up_tasks). */
export async function askForTask(body: string) {
  await write((db) => db.from("agent_notes").insert({ kind: "inbox", body, status: "new", topic: "task" }));
  await refresh("agent-notes");
}

export type RunResult = { started: true; sessionUrl: string | null } | { started: false; message: string };

/** Starts the assistant's check now (the scheduled task's API trigger, fired by our server). */
export async function runNow(reason?: "task"): Promise<RunResult> {
  try {
    const response = await fetch("/api/assistant/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = (await response.json().catch(() => ({}))) as { session_url?: string; error?: string; wait_seconds?: number };
    await refresh("agent-activity", "run-now");
    if (response.ok) return { started: true, sessionUrl: body.session_url ?? null };
    if (response.status === 429) return { started: false, message: "It started a moment ago. Give it a minute or two." };
    if (response.status === 409) return { started: false, message: "Run now isn’t set up yet (Settings → Assistant)." };
    const claude = (body as { status?: number }).status;
    if (claude === 401 || claude === 403 || claude === 404)
      return { started: false, message: "Claude didn’t accept the Run now key. Set it up again in Settings → Assistant." };
    return { started: false, message: `It didn’t start: ${body.error ?? "something went wrong"}. Try again in a minute.` };
  } catch {
    return { started: false, message: "No connection. Try again in a minute." };
  }
}

/** Applies the suggestion's change as you (row level security applies) and marks it accepted. */
export async function acceptSuggestion(id: string) {
  await write((db) => db.rpc("accept_agent_suggestion", { suggestion_id: id }));
  await refresh("agent-", "events", "items:", "meal-plan", "reminders");
}

export async function dismissSuggestion(id: string) {
  await write((db) =>
    db.from("agent_suggestions").update({ status: "dismissed", responded_at: new Date().toISOString() }).eq("id", id),
  );
  await refresh("agent-suggestions");
}

/** The button label for what Accept will do. */
export function acceptLabel(change: AgentChange | null): string {
  switch (change?.type) {
    case "add_event":
      return "Add to timetable";
    case "add_shopping_items":
      return "Add to shopping";
    case "set_meal":
      return `Plan ${change.slot}`;
    case "add_reminder":
      return "Add reminder";
    case "add_task":
      return "Add task";
    case "add_work_block":
      return "Book it";
    case "add_list_item":
      return { shopping: "Add to shopping", movies: "Add to Watch", books: "Add to Read", albums: "Add to Listen" }[change.list];
    default:
      return "Good idea";
  }
}
