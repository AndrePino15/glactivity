"use client";

import { refresh, write } from "@/lib/db/client";
import type { AgentChange } from "@/lib/db/types";

/** Tells the assistant something; its next check reads it. */
export async function tellAssistant(body: string) {
  await write((db) => db.from("agent_notes").insert({ kind: "inbox", body, status: "new" }));
  await refresh("agent-notes");
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
