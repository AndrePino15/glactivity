import { describe, expect, it } from "vitest";
import type { Goal, Milestone, Task, WorkBlock } from "./db/types";
import { goalView, hiddenTaskIds, milestoneView } from "./goals";

const TODAY = "2026-11-17";
const NOW = new Date("2026-11-17T12:00:00Z");

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g",
  title: "Imperial MSc",
  why: null,
  target_date: "2027-09-30",
  status: "active",
  source: "claude",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  ...over,
});
const milestone = (over: Partial<Milestone>): Milestone => ({
  id: "m",
  goal_id: "g",
  title: "Milestone",
  target_date: null,
  position: 0,
  status: "open",
  date_source_url: null,
  date_confirmed: true,
  notes: null,
  ...over,
});
const task = (over: Partial<Task>): Task => ({
  id: "t",
  title: "Task",
  notes: null,
  subject: null,
  due_on: null,
  due_time: null,
  estimate_minutes: 60,
  priority: 2,
  status: "open",
  source: "claude",
  created_at: "2026-11-01T00:00:00Z",
  completed_at: null,
  milestone_id: "m1",
  ...over,
});
const block = (over: Partial<WorkBlock>): WorkBlock => ({
  id: "b",
  task_id: "t",
  starts_at: "2026-11-16T09:00:00Z",
  ends_at: "2026-11-16T10:00:00Z",
  status: "planned",
  source: "claude",
  note: null,
  ...over,
});

describe("goal progress", () => {
  const milestones = [
    milestone({ id: "m1", title: "Shortlist", position: 0, target_date: "2026-12-01", status: "done" }),
    milestone({ id: "m2", title: "Statement", position: 1, target_date: "2027-01-15" }),
    milestone({ id: "m3", title: "Old idea", position: 2, status: "dropped" }),
  ];
  const tasks = [
    task({ id: "t1", milestone_id: "m1", estimate_minutes: 120, status: "done" }),
    task({ id: "t2", milestone_id: "m2", title: "Draft statement", estimate_minutes: 360, created_at: "2026-11-02T00:00:00Z" }),
    task({ id: "t3", milestone_id: "m2", title: "Ask referees", estimate_minutes: null, due_on: "2026-11-20" }),
    task({ id: "t4", milestone_id: "m3", estimate_minutes: 600 }),
  ];
  const blocks = [
    block({ id: "past", task_id: "t2", starts_at: "2026-11-16T09:00:00Z", ends_at: "2026-11-16T11:00:00Z" }),
    block({ id: "soon", task_id: "t2", status: "tentative", starts_at: "2026-11-18T09:00:00Z", ends_at: "2026-11-18T10:30:00Z" }),
  ];

  it("weights done work by estimated hours, leaving out dropped milestones", () => {
    const view = goalView(goal(), milestones, tasks, blocks, NOW, TODAY);
    // 120 done + 120 of 360 spent + 0 of 60 (no estimate) = 240 of 540
    expect(view.progress).toEqual({ estimate: 540, done: 240, planned: 90, share: 240 / 540 });
    expect(view.milestones.map((m) => [m.title, m.state])).toEqual([
      ["Shortlist", "done"],
      ["Statement", "on_track"],
      ["Old idea", "dropped"],
    ]);
  });

  it("names the next steps, soonest deadline first, with when they're planned", () => {
    const view = goalView(goal(), milestones, tasks, blocks, NOW, TODAY);
    expect(view.next.map((n) => [n.task.title, n.nextBlock])).toEqual([
      ["Ask referees", null],
      ["Draft statement", "2026-11-18T09:00:00Z"],
    ]);
  });

  it("flags milestones that are late or need too much a day", () => {
    const late = milestoneView(milestone({ id: "m2", target_date: "2026-11-10" }), tasks, blocks, NOW, TODAY);
    expect(late.state).toBe("late");
    const tight = milestoneView(milestone({ id: "m2", target_date: "2026-11-19" }), tasks, blocks, NOW, TODAY);
    expect(tight.state).toBe("at_risk"); // 300 minutes left over 2 days
  });
});

describe("drafts and paused goals", () => {
  it("keeps their tasks out of the task list until the goal is active", () => {
    const hidden = hiddenTaskIds(
      [goal({ id: "a", status: "draft" }), goal({ id: "b" })],
      [milestone({ id: "ma", goal_id: "a" }), milestone({ id: "mb", goal_id: "b" })],
      [task({ id: "x", milestone_id: "ma" }), task({ id: "y", milestone_id: "mb" }), task({ id: "z", milestone_id: null })],
    );
    expect([...hidden]).toEqual(["x"]);
  });
});

describe("Today's next goal step", () => {
  it("is the soonest study time on an open step of an active goal", async () => {
    const { nextGoalBlock } = await import("./goals");
    const goals = [goal({ id: "a" }), goal({ id: "p", status: "paused" })];
    const milestones = [milestone({ id: "ma", goal_id: "a" }), milestone({ id: "mp", goal_id: "p" }), milestone({ id: "md", goal_id: "a", status: "done" })];
    const tasks = [task({ id: "x", milestone_id: "ma", title: "Statement" }), task({ id: "y", milestone_id: "mp" }), task({ id: "z", milestone_id: "md" })];
    const blocks = [
      block({ id: "1", task_id: "y", status: "planned", starts_at: "2026-11-18T08:00:00Z" }),
      block({ id: "2", task_id: "z", status: "planned", starts_at: "2026-11-18T08:30:00Z" }),
      block({ id: "3", task_id: "x", status: "tentative", starts_at: "2026-11-19T09:00:00Z" }),
    ];
    const next = nextGoalBlock(goals, milestones, tasks, blocks, NOW);
    expect([next?.task.title, next?.goal.id, next?.startsAt]).toEqual(["Statement", "a", "2026-11-19T09:00:00Z"]);
  });
});
