"use client";

import { useState } from "react";
import { EmptyState, List, Row, Section } from "@/components/ui";
import { AskBox, cancelNote, Waiting } from "@/components/tasks/AskBox";
import { TaskSheet } from "@/components/tasks/TaskSheet";
import { askForTask } from "@/lib/assistant/actions";
import { addDays, relativeDay } from "@/lib/dates";
import { useAgentNotes, useGoals, useMilestones, useRunNow, useTasks, useToday, useWorkBlocks } from "@/lib/db/hooks";
import type { Task } from "@/lib/db/types";
import { hiddenTaskIds } from "@/lib/goals";
import { groupTasks, taskDetail, taskProgress } from "@/lib/tasks";
import { useNow } from "@/lib/use-now";
import styles from "@/components/tasks/tasks.module.css";

/**
 * Coursework, applications and admin with deadlines. You describe a task in
 * your own words; the assistant turns it into a proper task and plans time.
 */
export function TasksContent() {
  const today = useToday();
  const now = useNow();
  const tasks = useTasks();
  const notes = useAgentNotes();
  // Study time from two months back (time put in) to two months ahead.
  const blocks = useWorkBlocks(today ? addDays(today, -60) : null, today ? addDays(today, 60) : null);
  const [open, setOpen] = useState<Task | null>(null);
  const runNowStatus = useRunNow();
  const goals = useGoals();
  const milestones = useMilestones();

  if (!today || !now) return null;
  const canRunNow = runNowStatus.data.connected;
  const waiting = notes.data.filter((n) => n.topic === "task" && n.status === "new");
  // Tasks of draft or paused goals wait on the goal's page until it's active.
  const hidden = hiddenTaskIds(goals.data, milestones.data, tasks.data);
  const visible = tasks.data.filter((t) => !hidden.has(t.id));
  const groups = groupTasks(visible, today);
  const done = visible.filter((t) => t.status === "done").slice(0, 8);

  return (
    <>
      <AskBox
        label="Tell your assistant about a task"
        placeholder="Lab report, about 3 hours, due next Wednesday"
        hint="Say what it is, when it’s due and roughly how long it takes."
        sentHint={{ now: "Sent. Your assistant is setting it up now.", later: "Sent. Your assistant will set it up." }}
        reason="task"
        canRunNow={canRunNow}
        onSend={askForTask}
      />

      <Waiting
        notes={waiting}
        today={today}
        canRunNow={canRunNow}
        later="Your assistant sets these up at its next check (about 06:45 and 17:45). For it straight away, ask Claude: “Set up my new tasks.”"
        onCancel={cancelNote}
      />

      {tasks.loaded && groups.length === 0 && waiting.length === 0 && (
        <EmptyState pose="celebrating" title="Nothing on your plate">
          Tell your assistant about coursework, applications or admin. It turns them into tasks and plans time for them.
        </EmptyState>
      )}

      {groups.map((group) => (
        <Section key={group.title} title={group.title}>
          <List>
            {group.tasks.map((task) => {
              const progress = taskProgress(task, blocks.data, now);
              return (
                <Row
                  key={task.id}
                  title={
                    <span className={styles.wrap}>
                      {task.priority === 1 && <span className={styles.high}>! </span>}
                      {task.title}
                    </span>
                  }
                  detail={
                    <>
                      <span className={styles.wrap}>{taskDetail(task, blocks.data, now) || "No deadline or estimate yet"}</span>
                      {progress.share !== null && (
                        <span className={styles.progress} aria-label={`${Math.round(progress.share * 100)}% done`}>
                          <span style={{ width: `${Math.max(progress.share * 100, 2)}%` }} />
                        </span>
                      )}
                    </>
                  }
                  trailing={task.due_on ? (task.due_on < today ? "overdue" : relativeDay(today, task.due_on)) : undefined}
                  onClick={() => setOpen(task)}
                />
              );
            })}
          </List>
        </Section>
      ))}

      {done.length > 0 && (
        <Section title="Done recently">
          <List>
            {done.map((task) => (
              <Row key={task.id} title={task.title} muted onClick={() => setOpen(task)} />
            ))}
          </List>
        </Section>
      )}

      <TaskSheet task={open} blocks={blocks.data} today={today} onClose={() => setOpen(null)} />
    </>
  );
}
