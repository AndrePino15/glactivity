"use client";

import { useState, type FormEvent } from "react";
import { EmptyState, List, Row, Section } from "@/components/ui";
import { TaskSheet } from "@/components/tasks/TaskSheet";
import { addDays, relativeDay } from "@/lib/dates";
import { refresh, write } from "@/lib/db/client";
import { useTasks, useToday, useWorkBlocks } from "@/lib/db/hooks";
import type { Task } from "@/lib/db/types";
import { groupTasks, parseQuickTask, taskDetail, taskProgress } from "@/lib/tasks";
import { useNow } from "@/lib/use-now";
import styles from "@/components/tasks/tasks.module.css";

/** Coursework, applications and admin with deadlines; the assistant plans time for them. */
export function TasksContent() {
  const today = useToday();
  const now = useNow();
  const tasks = useTasks();
  // Study time from a fortnight back (time put in) to two months ahead.
  const blocks = useWorkBlocks(today ? addDays(today, -60) : null, today ? addDays(today, 60) : null);
  const [open, setOpen] = useState<Task | null>(null);

  if (!today || !now) return null;
  const groups = groupTasks(tasks.data, today);
  const done = tasks.data.filter((t) => t.status === "done").slice(0, 8);

  return (
    <>
      <QuickTask today={today} />

      {tasks.loaded && groups.length === 0 && (
        <EmptyState pose="celebrating" title="Nothing on your plate">
          Add coursework, applications or admin with a deadline and how long it takes. Your assistant plans time for it.
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
                    <>
                      {task.priority === 1 && <span className={styles.high}>! </span>}
                      {task.title}
                    </>
                  }
                  detail={
                    <>
                      {taskDetail(task, blocks.data, now) || "No deadline or estimate yet"}
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

function QuickTask({ today }: { today: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setText("");
    try {
      const task = parseQuickTask(value, today);
      await write((db) => db.from("tasks").insert(task));
      await refresh("tasks");
    } catch {
      setText(value); // keep what was typed so nothing is lost
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.add}>
      <input
        className={styles.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Essay 5h due Fri"
        aria-label="Add a task"
        enterKeyHint="done"
        autoCapitalize="sentences"
        disabled={busy}
      />
      <p className={styles.hint}>Add how long it takes (5h, 90m) and when it’s due. “!” marks it important.</p>
    </form>
  );
}
