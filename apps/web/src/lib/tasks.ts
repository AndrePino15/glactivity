import { daysBetween, formatShortDay, toISODate, type ISODate } from "./dates";
import type { CalendarEvent, Task, WorkBlock } from "./db/types";

/** "5 h", "1.5 h", "45 min" (with a non-breaking space, so the number and unit stay together) */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}\u00a0min`;
  const h = Math.round((minutes / 60) * 2) / 2;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)}\u00a0h`;
}

const blockMinutes = (b: WorkBlock) => Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);

/** Time put in (kept blocks already passed) and time still planned, per task. */
export function taskProgress(task: Task, blocks: WorkBlock[], now: Date) {
  let spent = 0;
  let planned = 0;
  for (const b of blocks) {
    if (b.task_id !== task.id) continue;
    if (b.status === "planned" && new Date(b.ends_at) <= now) spent += blockMinutes(b);
    else if ((b.status === "planned" || b.status === "tentative") && new Date(b.ends_at) > now) planned += blockMinutes(b);
  }
  const estimate = task.estimate_minutes ?? 0;
  return {
    spent,
    planned,
    /** 0–1 share of the estimate already put in; null when there's no estimate. */
    share: estimate > 0 ? Math.min(1, spent / estimate) : null,
    /** Hours still not covered by time put in or planned. */
    unplanned: estimate > 0 ? Math.max(0, estimate - spent - planned) : 0,
  };
}

/** "Due Fri 21 Nov · 5 h · 2 h done · 1 h planned" */
export function taskDetail(task: Task, blocks: WorkBlock[], now: Date): string {
  const p = taskProgress(task, blocks, now);
  return [
    task.due_on ? `Due ${formatShortDay(task.due_on)}${task.due_time ? ` ${task.due_time.slice(0, 5)}` : ""}` : null,
    task.subject,
    task.estimate_minutes ? formatMinutes(task.estimate_minutes) : null,
    p.spent ? `${formatMinutes(p.spent)} done` : null,
    p.planned ? `${formatMinutes(p.planned)} planned` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type TaskGroup = { title: string; tasks: Task[] };

/** Open tasks by when they're due: overdue and this week first, then later, then no deadline. */
export function groupTasks(tasks: Task[], today: ISODate): TaskGroup[] {
  const open = tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || a.priority - b.priority);
  const soon = open.filter((t) => t.due_on && daysBetween(today, t.due_on) <= 7);
  const later = open.filter((t) => t.due_on && daysBetween(today, t.due_on) > 7);
  const someday = open.filter((t) => !t.due_on);
  return [
    { title: "This week", tasks: soon },
    { title: "Later", tasks: later },
    { title: "No deadline", tasks: someday },
  ].filter((g) => g.tasks.length > 0);
}

/** Study blocks as rows the calendar views can show next to events. */
export function blocksAsEvents(blocks: WorkBlock[], tasks: Task[]): CalendarEvent[] {
  return blocks
    .filter((b) => b.status === "planned" || b.status === "tentative")
    .map((b) => {
      const task = tasks.find((t) => t.id === b.task_id) ?? null;
      return {
        id: `block:${b.id}`,
        source_id: null,
        external_uid: null,
        title: task?.title ?? "Study",
        location: null,
        notes: b.note,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        all_day: false,
        category: "other",
        block: { ...b, task },
      };
    });
}

/** Events and study blocks together, in time order. */
export function withBlocks(events: CalendarEvent[], blocks: WorkBlock[], tasks: Task[]): CalendarEvent[] {
  return [...events, ...blocksAsEvents(blocks, tasks)].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Open tasks due today or tomorrow (or overdue), for Today. */
export function dueSoon(tasks: Task[], today: ISODate): Task[] {
  return tasks.filter((t) => t.status === "open" && t.due_on && daysBetween(today, t.due_on) <= 1);
}

export const blockDay = (b: WorkBlock) => toISODate(new Date(b.starts_at));
