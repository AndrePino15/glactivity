"use client";

import { EmptyState, List, Note, Row, Section } from "@/components/ui";
import { AskBox, cancelNote, Waiting } from "@/components/tasks/AskBox";
import { askForGoal } from "@/lib/assistant/actions";
import { addDays, formatShortDay } from "@/lib/dates";
import {
  useAgentNotes,
  useGoalNotes,
  useGoals,
  useMilestones,
  useRunNow,
  useTasks,
  useToday,
  useWeeklyReview,
  useWorkBlocks,
} from "@/lib/db/hooks";
import { formatTarget, hours } from "@/lib/goal-format";
import { goalView, type GoalView } from "@/lib/goals";
import { useNow } from "@/lib/use-now";
import styles from "@/components/goals/goals.module.css";

/**
 * Big projects: each with its milestones and progress. You describe a goal in
 * your own words; the assistant drafts a plan with questions for you.
 */
export function GoalsContent() {
  const today = useToday();
  const now = useNow();
  const goals = useGoals();
  const milestones = useMilestones();
  const tasks = useTasks();
  const goalNotes = useGoalNotes();
  const notes = useAgentNotes();
  const review = useWeeklyReview();
  const runNowStatus = useRunNow();
  // Time put in over the last year and planned for the next.
  const blocks = useWorkBlocks(today ? addDays(today, -365) : null, today ? addDays(today, 365) : null);

  if (!today || !now) return null;
  const canRunNow = runNowStatus.data.connected;
  const waiting = notes.data.filter((n) => n.topic === "goal" && n.status === "new");
  const views = goals.data.map((g) => goalView(g, milestones.data, tasks.data, blocks.data, now, today));
  const byStatus = (status: string) => views.filter((v) => v.goal.status === status);
  const drafts = byStatus("draft");
  const active = byStatus("active");
  const paused = byStatus("paused");
  const done = byStatus("done");
  const latestReview = review.data[0];
  const openQuestions = (goalId: string) =>
    goalNotes.data.filter((n) => n.goal_id === goalId && n.kind === "question" && !n.resolved).length;

  return (
    <>
      <AskBox
        label="Tell your assistant about a goal"
        placeholder="Apply to Imperial for an MSc in AI, starting next September"
        hint="Say what you want, by when, and why it matters."
        sentHint={{ now: "Sent. Your assistant is drafting a plan now.", later: "Sent. Your assistant will draft a plan." }}
        reason="goal"
        canRunNow={canRunNow}
        onSend={askForGoal}
      />

      <Waiting
        notes={waiting}
        today={today}
        canRunNow={canRunNow}
        later="Your assistant drafts a plan at its next check (about 06:45 and 17:45). To plan it together now, use the “Plan a goal” prompt in a Claude chat."
        onCancel={cancelNote}
      />

      {latestReview && active.length > 0 && (
        <Section title="This week for your goals">
          <div className={styles.stack}>
            <p className={styles.review}>{latestReview.body}</p>
            <Note>From the review on {formatShortDay(latestReview.day)}</Note>
          </div>
        </Section>
      )}

      {drafts.length > 0 && (
        <Section title="Drafts to look over">
          <List>
            {drafts.map(({ goal }) => {
              const questions = openQuestions(goal.id);
              return (
                <Row
                  key={goal.id}
                  title={<span className={styles.wrap}>{goal.title}</span>}
                  detail={questions ? `${questions} question${questions === 1 ? "" : "s"} for you` : "Ready to look over"}
                  href={`/tasks/goals/${goal.id}`}
                />
              );
            })}
          </List>
        </Section>
      )}

      {active.length > 0 && (
        <Section title="Goals">
          <GoalList views={active} today={today} />
        </Section>
      )}

      {goals.loaded && goals.data.length === 0 && waiting.length === 0 && (
        <EmptyState pose="running" title="No big goals yet">
          An internship, a project, a master’s: describe one above and your assistant breaks it into milestones and plans the first steps.
        </EmptyState>
      )}

      {paused.length > 0 && (
        <Section title="Paused">
          <GoalList views={paused} today={today} />
        </Section>
      )}

      {done.length > 0 && (
        <Section title="Done">
          <List>
            {done.map(({ goal }) => (
              <Row key={goal.id} title={goal.title} muted href={`/tasks/goals/${goal.id}`} />
            ))}
          </List>
        </Section>
      )}
    </>
  );
}

function GoalList({ views, today }: { views: GoalView[]; today: string }) {
  return (
    <List>
      {views.map(({ goal, milestones, progress }) => {
        const counted = milestones.filter((m) => m.status !== "dropped");
        const finished = counted.filter((m) => m.status === "done").length;
        const trouble = counted.find((m) => m.state === "late" || m.state === "at_risk");
        return (
          <Row
            key={goal.id}
            title={<span className={styles.wrap}>{goal.title}</span>}
            detail={
              <>
                <span className={styles.wrap}>
                  {[
                    goal.target_date ? `By ${formatTarget(goal.target_date, today)}` : "Someday",
                    counted.length ? `${finished} of ${counted.length} milestones` : null,
                    progress.estimate ? `${hours(progress.done)} of ${hours(progress.estimate)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className={styles.bar} aria-label={`${Math.round(progress.share * 100)}% done`}>
                  <span style={{ width: `${Math.max(progress.share * 100, 2)}%` }} />
                </span>
              </>
            }
            trailing={
              trouble ? (
                <span className={styles.warn}>{trouble.state === "late" ? "Late" : "At risk"}</span>
              ) : (
                `${Math.round(progress.share * 100)}%`
              )
            }
            href={`/tasks/goals/${goal.id}`}
          />
        );
      })}
    </List>
  );
}
