"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button, EmptyState, List, Note, Row, Section, TextArea } from "@/components/ui";
import { TaskSheet } from "@/components/tasks/TaskSheet";
import { askForTask } from "@/lib/assistant/actions";
import { addDays, formatShortDay, formatTime, relativeDay, toISODate } from "@/lib/dates";
import { write } from "@/lib/db/client";
import { useAgentNotes, useTasks, useToday, useWorkBlocks } from "@/lib/db/hooks";
import type { AgentNote, Task } from "@/lib/db/types";
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

  if (!today || !now) return null;
  const waiting = notes.data.filter((n) => n.topic === "task" && n.status === "new");
  const groups = groupTasks(tasks.data, today);
  const done = tasks.data.filter((t) => t.status === "done").slice(0, 8);

  async function cancel(note: AgentNote) {
    await write((db) => db.from("agent_notes").delete().eq("id", note.id));
    await notes.mutate();
  }

  return (
    <>
      <AskBox />

      {waiting.length > 0 && (
        <Section title="Waiting for your assistant">
          <List>
            {waiting.map((n) => {
              const day = toISODate(new Date(n.created_at));
              return (
                <Row
                  key={n.id}
                  title={<span className={styles.wrap}>{n.body}</span>}
                  detail={`Sent ${day === today ? "today" : formatShortDay(day)}, ${formatTime(n.created_at)}`}
                  trailing={
                    <button type="button" className={styles.remove} aria-label={`Cancel: ${n.body}`} onClick={() => cancel(n)}>
                      <X size={16} strokeWidth={2} />
                    </button>
                  }
                />
              );
            })}
          </List>
          <Note>
            Your assistant sets these up at its next check. For it straight away, ask Claude: “Set up my new tasks.”
          </Note>
        </Section>
      )}

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

function AskBox() {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || state === "sending") return;
    setState("sending");
    try {
      await askForTask(value);
      setText("");
      setState("sent");
    } catch {
      setState("failed"); // what was typed stays in the box
    }
  }

  return (
    <form onSubmit={submit} className={styles.ask}>
      <TextArea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (state !== "sending") setState("idle");
        }}
        placeholder="Lab report, about 3 hours, due next Wednesday"
        aria-label="Tell your assistant about a task"
        rows={3}
        maxLength={1000}
        autoCapitalize="sentences"
        disabled={state === "sending"}
      />
      <div className={styles.askFoot}>
        <p className={styles.hint}>
          {state === "sent"
            ? "Sent. Your assistant will set it up."
            : state === "failed"
              ? "Couldn’t send that. Try again?"
              : "Say what it is, when it’s due and roughly how long it takes."}
        </p>
        <Button type="submit" disabled={!text.trim() || state === "sending"}>
          {state === "sending" ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
