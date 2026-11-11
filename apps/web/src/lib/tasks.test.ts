import { describe, expect, it } from "vitest";
import type { Task, WorkBlock } from "./db/types";
import { formatMinutes, groupTasks, taskDetail, taskProgress, withBlocks } from "./tasks";

const TODAY = "2026-11-17"; // a Tuesday

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Essay",
  notes: null,
  subject: null,
  due_on: "2026-11-20",
  due_time: null,
  estimate_minutes: 300,
  priority: 2,
  status: "open",
  source: "app",
  created_at: "2026-11-01T00:00:00Z",
  completed_at: null,
  ...over,
});
const block = (over: Partial<WorkBlock>): WorkBlock => ({
  id: "b",
  task_id: "t1",
  starts_at: "2026-11-16T09:00:00Z",
  ends_at: "2026-11-16T11:00:00Z",
  status: "planned",
  source: "app",
  note: null,
  ...over,
});

describe("progress", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const blocks = [
    block({ id: "past", starts_at: "2026-11-16T09:00:00Z", ends_at: "2026-11-16T11:00:00Z" }),
    block({ id: "skipped", status: "skipped", starts_at: "2026-11-16T14:00:00Z", ends_at: "2026-11-16T15:00:00Z" }),
    block({ id: "next", status: "tentative", starts_at: "2026-11-18T09:00:00Z", ends_at: "2026-11-18T10:00:00Z" }),
  ];

  it("counts kept time that has passed as done, and future blocks as planned", () => {
    expect(taskProgress(task(), blocks, now)).toEqual({ spent: 120, planned: 60, share: 0.4, unplanned: 120 });
    expect(taskDetail(task({ subject: "HIST2001" }), blocks, now).replace(/\u00a0/g, " ")).toBe("Due Fri 20 Nov · HIST2001 · 5 h · 2 h done · 1 h planned");
  });

  it("formats durations simply", () => {
    expect([formatMinutes(45), formatMinutes(60), formatMinutes(90), formatMinutes(300)]).toEqual(["45\u00a0min", "1\u00a0h", "1.5\u00a0h", "5\u00a0h"]);
  });
});

describe("lists and calendars", () => {
  it("groups open tasks by when they're due", () => {
    const groups = groupTasks(
      [task({ id: "a", due_on: "2026-11-30" }), task({ id: "b" }), task({ id: "c", due_on: null }), task({ id: "d", status: "done" })],
      TODAY,
    );
    expect(groups.map((g) => [g.title, g.tasks.map((t) => t.id)])).toEqual([
      ["This week", ["b"]],
      ["Later", ["a"]],
      ["No deadline", ["c"]],
    ]);
  });

  it("puts study blocks among events in time order, leaving out skipped ones", () => {
    const rows = withBlocks(
      [{ id: "e", source_id: null, external_uid: null, title: "Lecture", location: null, notes: null, starts_at: "2026-11-18T10:00:00Z", ends_at: "2026-11-18T11:00:00Z", all_day: false, category: "lecture" }],
      [block({ id: "x", status: "tentative", starts_at: "2026-11-18T08:30:00Z", ends_at: "2026-11-18T09:30:00Z" }), block({ id: "y", status: "skipped" })],
      [task()],
    );
    expect(rows.map((r) => [r.title, r.block?.status ?? null])).toEqual([
      ["Essay", "tentative"],
      ["Lecture", null],
    ]);
  });
});
