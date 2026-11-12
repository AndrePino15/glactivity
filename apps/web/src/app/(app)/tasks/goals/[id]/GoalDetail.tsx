"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, List, Note, PageHeader, Row, Section, TextButton } from "@/components/ui";
import { AskBox } from "@/components/tasks/AskBox";
import { TaskSheet } from "@/components/tasks/TaskSheet";
import { answerGoal } from "@/lib/assistant/actions";
import { addDays, formatShortDay, formatTime, toISODate } from "@/lib/dates";
import { refresh, write } from "@/lib/db/client";
import { useGoalNotes, useGoals, useMilestones, useRunNow, useTasks, useToday, useWorkBlocks } from "@/lib/db/hooks";
import type { Goal, Milestone, Task } from "@/lib/db/types";
import { formatTarget, hours, timeUntil } from "@/lib/goal-format";
import { goalView, STATE_LABEL, type MilestoneView } from "@/lib/goals";
import { useNow } from "@/lib/use-now";
import styles from "@/components/goals/goals.module.css";

const STATUS_NOTE: Record<Goal["status"], string | null> = {
  draft: null,
  active: null,
  paused: "Paused. Its tasks aren’t planned until you pick it up again.",
  done: "Done. Well played.",
};

/** One goal: why, progress, what's next, the assistant's questions, milestones on a timeline, and sources. */
export function GoalDetail({ id }: { id: string }) {
  const router = useRouter();
  const today = useToday();
  const now = useNow();
  const goals = useGoals();
  const milestones = useMilestones();
  const tasks = useTasks();
  const notes = useGoalNotes();
  const runNowStatus = useRunNow();
  const blocks = useWorkBlocks(today ? addDays(today, -365) : null, today ? addDays(today, 365) : null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!today || !now) return null;
  const goal = goals.data.find((g) => g.id === id);
  if (!goal) {
    return (
      <>
        <PageHeader back={{ href: "/tasks/goals", label: "Goals" }} title="Goal" />
        {goals.loaded && <EmptyState pose="running" title="This goal isn’t here any more" />}
      </>
    );
  }

  const view = goalView(goal, milestones.data, tasks.data, blocks.data, now, today);
  const own = notes.data.filter((n) => n.goal_id === goal.id);
  const questions = own.filter((n) => n.kind === "question" && !n.resolved);
  const answers = own.filter((n) => n.kind === "answer" && !n.resolved);
  const sources = own.filter((n) => n.kind === "source" || n.kind === "note");
  const draft = goal.status === "draft";
  const counted = view.milestones.filter((m) => m.status !== "dropped");

  async function setStatus(status: Goal["status"]) {
    await write((db) => db.from("goals").update({ status }).eq("id", goal!.id));
    // Paused or finished: free up the study time set aside for it.
    if (status === "paused" || status === "done") {
      const ids = view.milestones.flatMap((m) => m.tasks.map((t) => t.id));
      if (ids.length) {
        await write((db) =>
          db.from("work_blocks").update({ status: "withdrawn" }).in("task_id", ids).in("status", ["tentative", "planned"]).gt("starts_at", new Date().toISOString()),
        );
      }
    }
    await refresh("goals", "work-blocks");
  }

  async function remove() {
    await write((db) => db.from("goals").delete().eq("id", goal!.id));
    await refresh("goals", "milestones", "goal-notes", "tasks");
    router.push("/tasks/goals");
  }

  return (
    <>
      <PageHeader
        back={{ href: "/tasks/goals", label: "Goals" }}
        eyebrow={draft ? "Draft from your assistant" : undefined}
        title={<span className={styles.wrap}>{goal.title}</span>}
      />

      <Section>
        <div className={styles.stack}>
          {goal.why && <p className={styles.lead}>{goal.why}</p>}
          <p className={styles.meta}>
            {goal.target_date ? `By ${formatTarget(goal.target_date, today)} (${timeUntil(goal.target_date, today)})` : "No fixed date"}
            {counted.length > 0 && ` · ${counted.filter((m) => m.status === "done").length} of ${counted.length} milestones`}
          </p>
          {view.progress.estimate > 0 && (
            <div>
              <p className={styles.meta}>
                {Math.round(view.progress.share * 100)}% · {hours(view.progress.done)} of {hours(view.progress.estimate)} done
                {view.progress.planned > 0 && ` · ${hours(view.progress.planned)} planned`}
              </p>
              <span className={`${styles.bar} ${styles.big}`} aria-label={`${Math.round(view.progress.share * 100)}% done`}>
                <span style={{ width: `${Math.max(view.progress.share * 100, 1)}%` }} />
              </span>
            </div>
          )}
          {STATUS_NOTE[goal.status] && <Note>{STATUS_NOTE[goal.status]}</Note>}
          {draft && (
            <>
              <Note>
                Your assistant drafted this plan from what you told it. Answer its questions below and it refines the plan at the next
                check. When it looks right, start it: the planner then finds time for the first steps.
              </Note>
              <div>
                <Button onClick={() => setStatus("active")}>Looks good, start it</Button>
              </div>
            </>
          )}
        </div>
      </Section>

      {(questions.length > 0 || answers.length > 0) && (
        <Section title="Questions from your assistant">
          <div className={styles.stack}>
            {questions.length > 0 && (
              <List>
                {questions.map((q) => (
                  <Row key={q.id} title={<span className={`${styles.wrap} ${styles.question}`}>{q.body}</span>} />
                ))}
              </List>
            )}
            {answers.map((a) => (
              <Note key={a.id}>
                You said: “{a.body}” · {formatShortDay(toISODate(new Date(a.created_at)))}
              </Note>
            ))}
            <AskBox
              label="Answer your assistant"
              placeholder="Answer in your own words, all at once is fine"
              hint="It refines the plan with your answers."
              sentHint={{ now: "Thanks. Your assistant is updating the plan now.", later: "Thanks. It updates the plan at the next check." }}
              reason="goal"
              canRunNow={runNowStatus.data.connected}
              onSend={(text) => answerGoal(goal.id, text)}
              rows={3}
            />
          </div>
        </Section>
      )}

      {goal.status === "active" && view.next.length > 0 && (
        <Section title="What’s next">
          <List>
            {view.next.map(({ task, milestone, nextBlock }) => (
              <Row
                key={task.id}
                title={<span className={styles.wrap}>{task.title}</span>}
                detail={
                  nextBlock
                    ? `${formatShortDay(toISODate(new Date(nextBlock)))}, ${formatTime(nextBlock)} · ${milestone.title}`
                    : `Not planned yet · ${milestone.title}`
                }
                onClick={() => setOpenTask(task)}
              />
            ))}
          </List>
        </Section>
      )}

      {view.milestones.length > 0 && (
        <Section title="Milestones">
          <ol className={styles.timeline}>
            {view.milestones.map((m) => (
              <MilestoneItem key={m.id} milestone={m} today={today} onOpenTask={setOpenTask} />
            ))}
            {goal.target_date && (
              <li className={styles.milestone} data-state="target">
                <span className={styles.dot} aria-hidden />
                <div className={styles.milestoneHead}>
                  <span className={styles.milestoneTitle}>{goal.title}</span>
                  <span className={styles.state}>{formatTarget(goal.target_date, today)}</span>
                </div>
              </li>
            )}
          </ol>
        </Section>
      )}

      {sources.length > 0 && (
        <Section title="Sources and notes">
          <List>
            {sources.map((n) => (
              <Row
                key={n.id}
                title={<span className={styles.wrap}>{n.body}</span>}
                detail={n.url ? hostOf(n.url) : undefined}
                href={n.url ?? undefined}
                external={Boolean(n.url)}
              />
            ))}
          </List>
        </Section>
      )}

      <Section>
        <div className={styles.actions}>
          {goal.status === "active" && <TextButton onClick={() => setStatus("paused")}>Pause</TextButton>}
          {goal.status === "paused" && <TextButton onClick={() => setStatus("active")}>Pick it up again</TextButton>}
          {(goal.status === "active" || goal.status === "paused") && <TextButton onClick={() => setStatus("done")}>Mark done</TextButton>}
          {goal.status === "done" && <TextButton onClick={() => setStatus("active")}>Open again</TextButton>}
          {confirmDelete ? (
            <>
              <TextButton className={styles.danger} onClick={remove}>
                Yes, delete it
              </TextButton>
              <TextButton onClick={() => setConfirmDelete(false)}>Cancel</TextButton>
            </>
          ) : (
            <TextButton className={styles.danger} onClick={() => setConfirmDelete(true)}>
              Delete goal
            </TextButton>
          )}
        </div>
        {confirmDelete && <Note>This deletes the goal and its milestones. Its tasks stay in your task list.</Note>}
      </Section>

      <TaskSheet task={openTask} blocks={blocks.data} today={today} onClose={() => setOpenTask(null)} />
    </>
  );
}

function MilestoneItem({ milestone: m, today, onOpenTask }: { milestone: MilestoneView; today: string; onOpenTask: (t: Task) => void }) {
  const toConfirm = m.target_date && !m.date_confirmed;

  async function confirm(milestone: Milestone) {
    await write((db) => db.from("milestones").update({ date_confirmed: true }).eq("id", milestone.id));
    await refresh("milestones");
  }

  async function toggleDone() {
    const done = m.status !== "done";
    await write((db) => db.from("milestones").update({ status: done ? "done" : "open" }).eq("id", m.id));
    // Finishing a milestone finishes what's left of it and frees its study time.
    const open = m.tasks.filter((t) => t.status === "open").map((t) => t.id);
    if (done && open.length) {
      await write((db) => db.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).in("id", open));
      await write((db) =>
        db.from("work_blocks").update({ status: "withdrawn" }).in("task_id", open).in("status", ["tentative", "planned"]).gt("starts_at", new Date().toISOString()),
      );
    }
    await refresh("milestones", "tasks", "work-blocks");
  }

  const openTasks = m.tasks.filter((t) => t.status !== "dropped");
  return (
    <li className={styles.milestone} data-state={m.state}>
      <span className={styles.dot} data-state={m.state} aria-hidden />
      <div className={styles.milestoneHead}>
        <span className={`${styles.milestoneTitle} ${styles.wrap}`}>{m.title}</span>
        <span className={styles.state} data-state={m.state}>
          {m.target_date && m.state !== "done" && m.state !== "dropped" ? `${formatTarget(m.target_date, today)} · ` : ""}
          {STATE_LABEL[m.state]}
        </span>
      </div>
      {toConfirm && (
        <p className={styles.confirm}>
          <span>Date to confirm{m.date_source_url ? ":" : ""}</span>
          {m.date_source_url && (
            <a href={m.date_source_url} target="_blank" rel="noreferrer">
              {hostOf(m.date_source_url)}
            </a>
          )}
          <TextButton onClick={() => confirm(m)}>Confirm date</TextButton>
        </p>
      )}
      {m.progress.estimate > 0 && m.status !== "dropped" && (
        <span className={styles.bar} aria-label={`${Math.round(m.progress.share * 100)}% done`}>
          <span style={{ width: `${Math.max(m.progress.share * 100, 2)}%` }} />
        </span>
      )}
      {openTasks.length > 0 && (
        <div className={styles.tasks}>
          <List>
            {openTasks.map((t) => (
              <Row
                key={t.id}
                title={<span className={styles.wrap}>{t.title}</span>}
                detail={t.estimate_minutes ? hours(t.estimate_minutes) : undefined}
                muted={t.status === "done"}
                onClick={() => onOpenTask(t)}
              />
            ))}
          </List>
        </div>
      )}
      {m.status !== "dropped" && (
        <p className={styles.confirm}>
          <TextButton onClick={toggleDone}>{m.status === "done" ? "Not done yet" : "Mark milestone done"}</TextButton>
        </p>
      )}
    </li>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
