import { daysBetween, type ISODate } from "./dates";
import type { Goal, Milestone, Task, WorkBlock } from "./db/types";

/** Tasks without an estimate still count, as an hour each. */
const DEFAULT_MINUTES = 60;
/** More study than this per day to finish a milestone on time puts it at risk. */
const AT_RISK_MINUTES_PER_DAY = 90;

export type MilestoneState = "done" | "dropped" | "late" | "at_risk" | "on_track";

const blockMinutes = (b: WorkBlock) => Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);

/** Minutes put in (kept blocks already over) and still planned (future kept or pencilled-in blocks) per task. */
function timeOn(taskId: string, blocks: WorkBlock[], now: Date) {
  let spent = 0;
  let planned = 0;
  for (const b of blocks) {
    if (b.task_id !== taskId) continue;
    if (b.status === "planned" && new Date(b.ends_at) <= now) spent += blockMinutes(b);
    else if ((b.status === "planned" || b.status === "tentative") && new Date(b.ends_at) > now) planned += blockMinutes(b);
  }
  return { spent, planned };
}

export type Progress = {
  /** All the work, in minutes, weighted by each task's estimate. */
  estimate: number;
  /** Work done: finished tasks count in full, open ones up to the time put in. */
  done: number;
  /** Study time still planned. */
  planned: number;
  /** 0–1. */
  share: number;
};

function progressOf(tasks: Task[], blocks: WorkBlock[], now: Date): Progress {
  let estimate = 0;
  let done = 0;
  let planned = 0;
  for (const t of tasks) {
    if (t.status === "dropped") continue;
    const weight = t.estimate_minutes ?? DEFAULT_MINUTES;
    const time = timeOn(t.id, blocks, now);
    estimate += weight;
    done += t.status === "done" ? weight : Math.min(time.spent, weight);
    if (t.status === "open") planned += time.planned;
  }
  return { estimate, done, planned, share: estimate > 0 ? done / estimate : 0 };
}

export type MilestoneView = Milestone & { tasks: Task[]; progress: Progress; state: MilestoneState };

export function milestoneView(m: Milestone, tasks: Task[], blocks: WorkBlock[], now: Date, today: ISODate): MilestoneView {
  const own = tasks.filter((t) => t.milestone_id === m.id);
  const progress = progressOf(own, blocks, now);
  if (own.length === 0) progress.share = m.status === "done" ? 1 : 0;
  if (m.status === "done") progress.share = 1;

  return { ...m, tasks: own, progress, state: milestoneState(m, progress, today) };
}

/** Done, late, at risk (more than 1½ hours a day needed, or nearly due and not nearly done) or on track. */
export function milestoneState(
  m: Pick<Milestone, "status" | "target_date">,
  progress: Pick<Progress, "estimate" | "done" | "share">,
  today: ISODate,
): MilestoneState {
  if (m.status === "done" || m.status === "dropped") return m.status;
  if (!m.target_date) return "on_track";
  if (m.target_date < today) return "late";
  const daysLeft = Math.max(daysBetween(today, m.target_date), 1);
  const remaining = Math.max(progress.estimate - progress.done, 0);
  if (remaining / daysLeft > AT_RISK_MINUTES_PER_DAY || (daysLeft <= 3 && progress.estimate > 0 && progress.share < 0.75)) return "at_risk";
  return "on_track";
}

/** The same weighting from per-task totals (what the connector reads). */
export function progressFromTotals(tasks: { status: string; estimate_minutes: number | null; spent_minutes: number }[]) {
  let estimate = 0;
  let done = 0;
  for (const t of tasks) {
    if (t.status === "dropped") continue;
    const weight = t.estimate_minutes ?? DEFAULT_MINUTES;
    estimate += weight;
    done += t.status === "done" ? weight : Math.min(t.spent_minutes, weight);
  }
  return { estimate, done, share: estimate > 0 ? done / estimate : 0 };
}

export type NextStep = { task: Task; milestone: Milestone; nextBlock: string | null };

export type GoalView = {
  goal: Goal;
  milestones: MilestoneView[];
  progress: Progress;
  /** The next one or two concrete steps, and when they're planned. */
  next: NextStep[];
};

/** A goal with its milestones in order, progress weighted by estimated hours, and what's next. */
export function goalView(goal: Goal, milestones: Milestone[], tasks: Task[], blocks: WorkBlock[], now: Date, today: ISODate): GoalView {
  const own = milestones
    .filter((m) => m.goal_id === goal.id)
    .sort((a, b) => a.position - b.position || (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"))
    .map((m) => milestoneView(m, tasks, blocks, now, today));
  const counted = own.filter((m) => m.status !== "dropped");
  const progress = progressOf(counted.flatMap((m) => m.tasks), blocks, now);

  const next: NextStep[] = [];
  for (const m of counted) {
    if (m.status !== "open") continue;
    const open = m.tasks
      .filter((t) => t.status === "open")
      .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || a.created_at.localeCompare(b.created_at));
    for (const task of open) {
      const upcoming = blocks
        .filter((b) => b.task_id === task.id && (b.status === "planned" || b.status === "tentative") && new Date(b.starts_at) > now)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
      next.push({ task, milestone: m, nextBlock: upcoming?.starts_at ?? null });
      if (next.length === 2) break;
    }
    if (next.length === 2) break;
  }
  return { goal, milestones: own, progress, next };
}

export const STATE_LABEL: Record<MilestoneState, string> = {
  done: "Done",
  dropped: "Dropped",
  late: "Late",
  at_risk: "At risk",
  on_track: "On track",
};

/** Tasks that belong to a goal that's a draft or paused: not shown with your other tasks yet. */
export function hiddenTaskIds(goals: Goal[], milestones: Milestone[], tasks: Task[]): Set<string> {
  const quiet = new Set(goals.filter((g) => g.status === "draft" || g.status === "paused").map((g) => g.id));
  const quietMilestones = new Set(milestones.filter((m) => quiet.has(m.goal_id)).map((m) => m.id));
  return new Set(tasks.filter((t) => t.milestone_id && quietMilestones.has(t.milestone_id)).map((t) => t.id));
}

/** The soonest planned (or pencilled-in) study time on an open step of an active goal. */
export function nextGoalBlock(goals: Goal[], milestones: Milestone[], tasks: Task[], blocks: WorkBlock[], now: Date) {
  const active = new Map(goals.filter((g) => g.status === "active").map((g) => [g.id, g]));
  const openMilestones = new Map(milestones.filter((m) => m.status === "open" && active.has(m.goal_id)).map((m) => [m.id, m]));
  const goalTasks = new Map(tasks.filter((t) => t.status === "open" && t.milestone_id && openMilestones.has(t.milestone_id)).map((t) => [t.id, t]));
  const block = blocks
    .filter((b) => (b.status === "planned" || b.status === "tentative") && goalTasks.has(b.task_id) && new Date(b.starts_at) > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  if (!block) return null;
  const task = goalTasks.get(block.task_id)!;
  return { task, goal: active.get(openMilestones.get(task.milestone_id!)!.goal_id)!, startsAt: block.starts_at };
}
