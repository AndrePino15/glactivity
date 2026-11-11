"use client";

import { useState, type FormEvent } from "react";
import { Button, Label, List, Note, Row, Segmented, Select, Sheet, TextArea, TextButton, TextField } from "@/components/ui";
import { formatShortDay, formatTime, toISODate, toTimestamp, type ISODate } from "@/lib/dates";
import { refresh, write } from "@/lib/db/client";
import type { Task, WorkBlock } from "@/lib/db/types";
import { formatMinutes } from "@/lib/tasks";
import styles from "./tasks.module.css";

const PRIORITIES = [
  { value: "1", label: "High" },
  { value: "2", label: "Normal" },
  { value: "3", label: "Low" },
] as const;

const LENGTHS = [30, 60, 90, 120];

/** Edit a task, mark it done, and see or add its study time. */
export function TaskSheet({
  task,
  blocks,
  today,
  onClose,
}: {
  task: Task | null;
  blocks: WorkBlock[];
  today: ISODate;
  onClose: () => void;
}) {
  return (
    <Sheet open={task !== null} onClose={onClose} title={task?.title ?? "Task"}>
      {task && <TaskForm key={task.id} task={task} blocks={blocks.filter((b) => b.task_id === task.id)} today={today} onDone={onClose} />}
    </Sheet>
  );
}

function TaskForm({ task, blocks, today, onDone }: { task: Task; blocks: WorkBlock[]; today: ISODate; onDone: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due_on ?? "");
  const [hours, setHours] = useState(task.estimate_minutes ? String(task.estimate_minutes / 60) : "");
  const [priority, setPriority] = useState(String(task.priority) as "1" | "2" | "3");
  const [subject, setSubject] = useState(task.subject ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  async function run(change: () => PromiseLike<unknown>) {
    try {
      await change();
      await refresh("tasks", "work-blocks");
      onDone();
    } catch {
      setError("That didn’t save. Try again?");
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const estimate = hours.trim() ? Math.round(Number(hours.replace(",", ".")) * 60) : null;
    if (estimate !== null && (Number.isNaN(estimate) || estimate < 0 || estimate > 6000)) {
      setError("Hours should be a number, like 5 or 1.5.");
      return;
    }
    void run(() =>
      write((db) =>
        db
          .from("tasks")
          .update({
            title: title.trim() || task.title,
            due_on: due || null,
            due_time: due ? task.due_time : null,
            estimate_minutes: estimate,
            priority: Number(priority),
            subject: subject.trim() || null,
            notes: notes.trim() || null,
          })
          .eq("id", task.id),
      ),
    );
  }

  const close = (status: "done" | "open") =>
    run(async () => {
      await write((db) =>
        db.from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", task.id),
      );
      // Finished early: free up the time that was set aside.
      if (status === "done") {
        await write((db) =>
          db.from("work_blocks").update({ status: "withdrawn" }).eq("task_id", task.id).in("status", ["tentative", "planned"]).gt("starts_at", new Date().toISOString()),
        );
      }
    });

  const upcoming = blocks
    .filter((b) => (b.status === "planned" || b.status === "tentative") && new Date(b.ends_at) > new Date())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className={styles.form}>
      <form className={styles.form} onSubmit={save}>
        <Label text="Task">
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Label>
        <Label text="Due">
          <TextField type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Label>
        <Label text="Hours it takes">
          <TextField inputMode="decimal" placeholder="e.g. 5 or 1.5" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Label>
        <div className={styles.group}>
          <span className={styles.groupLabel}>Importance</span>
          <Segmented label="Importance" value={priority} options={[...PRIORITIES]} onChange={setPriority} />
        </div>
        <Label text="Module or subject">
          <TextField value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Label>
        <Label text="Notes">
          <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Label>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          {task.status === "open" ? (
            <TextButton onClick={() => close("done")}>Mark done</TextButton>
          ) : (
            <TextButton onClick={() => close("open")}>Open again</TextButton>
          )}
          <Button type="submit">Save</Button>
        </div>
      </form>

      {task.status === "open" && (
        <section className={styles.study}>
          <h3>Study time</h3>
          {upcoming.length > 0 ? (
            <List>
              {upcoming.map((b) => (
                <Row
                  key={b.id}
                  title={`${formatShortDay(toISODate(new Date(b.starts_at)))} · ${formatTime(b.starts_at)}–${formatTime(b.ends_at)}`}
                  trailing={b.status === "tentative" ? "Pencilled in" : undefined}
                />
              ))}
            </List>
          ) : (
            <Note>Nothing planned yet. Your assistant places time before the deadline, or add some yourself.</Note>
          )}
          <AddStudyTime task={task} today={today} onAdded={() => refresh("work-blocks", "tasks")} />
        </section>
      )}

      <TextButton
        className={styles.danger}
        onClick={() => {
          if (window.confirm(`Delete “${task.title}” and its study time?`)) void run(() => write((db) => db.from("tasks").delete().eq("id", task.id)));
        }}
      >
        Delete task
      </TextButton>
    </div>
  );
}

function AddStudyTime({ task, today, onAdded }: { task: Task; today: ISODate; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("10:00");
  const [length, setLength] = useState("60");
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const starts = toTimestamp(date, start);
    const ends = new Date(new Date(starts).getTime() + Number(length) * 60_000).toISOString();
    try {
      await write((db) => db.from("work_blocks").insert({ task_id: task.id, starts_at: starts, ends_at: ends, status: "planned" }));
      setOpen(false);
      setError(null);
      onAdded();
    } catch {
      setError("Couldn’t add that time.");
    }
  }

  if (!open)
    return (
      <TextButton className={styles.start} onClick={() => setOpen(true)}>
        Add study time
      </TextButton>
    );
  return (
    <form className={styles.form} onSubmit={add}>
      <div className={styles.times}>
        <Label text="Date">
          <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Label>
        <Label text="Starts">
          <TextField type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        </Label>
      </div>
      <Label text="For">
        <Select value={length} onChange={(e) => setLength(e.target.value)}>
          {LENGTHS.map((m) => (
            <option key={m} value={m}>
              {formatMinutes(m)}
            </option>
          ))}
        </Select>
      </Label>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <TextButton onClick={() => setOpen(false)}>Cancel</TextButton>
        <Button type="submit">Add</Button>
      </div>
    </form>
  );
}
