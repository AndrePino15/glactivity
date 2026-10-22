"use client";

import { useState, type FormEvent } from "react";
import {
  Button,
  Check,
  EmptyState,
  Label,
  List,
  Row,
  Select,
  Sheet,
  TextButton,
  TextField,
} from "@/components/ui";
import { write } from "@/lib/db/client";
import { useReminders, useToday } from "@/lib/db/hooks";
import type { Recurrence, Reminder } from "@/lib/db/types";
import { formatShortDay, relativeDay, type ISODate } from "@/lib/dates";
import { nextDue } from "@/lib/reminders";
import styles from "../lists.module.css";

const REPEATS: { value: Recurrence; label: string; short: string }[] = [
  { value: "none", label: "Doesn’t repeat", short: "" },
  { value: "weekly", label: "Every week", short: "every week" },
  { value: "monthly", label: "Every month", short: "every month" },
  { value: "yearly", label: "Every year", short: "every year" },
];

const NOTICE = [
  { value: 0, label: "On the day" },
  { value: 1, label: "1 day before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "1 week before" },
];

export function RemindersList() {
  const today = useToday();
  const { data: reminders, loaded, mutate } = useReminders();
  const [editing, setEditing] = useState<Reminder | "new" | null>(null);

  const rows = today
    ? reminders
        .map((reminder) => ({ reminder, due: nextDue(reminder, today) }))
        .filter((r): r is { reminder: Reminder; due: ISODate } => r.due !== null)
        .sort((a, b) => a.due.localeCompare(b.due))
    : [];

  async function markDone(reminder: Reminder, due: ISODate) {
    const patch = { last_done_on: due, archived: reminder.recurrence === "none" };
    await mutate(
      async () => {
        await write((db) => db.from("reminders").update(patch).eq("id", reminder.id));
        return undefined;
      },
      {
        optimisticData: reminders.map((r) => (r.id === reminder.id ? { ...r, ...patch } : r)),
        populateCache: false,
        revalidate: true,
      },
    );
  }

  return (
    <>
      <div>
        {loaded && rows.length === 0 ? (
          <EmptyState pose="lounging" title="Nothing to remember">
            Rent, bills, renewals: add them once and they’ll come back round when they’re due.
          </EmptyState>
        ) : (
          <List>
            {rows.map(({ reminder, due }) => {
              const repeat = REPEATS.find((r) => r.value === reminder.recurrence)?.short;
              const when = today ? relativeDay(today, due) : "";
              return (
                <Row
                  key={reminder.id}
                  control={<Check checked={false} onToggle={() => markDone(reminder, due)} label={`Done: ${reminder.title}`} />}
                  title={reminder.title}
                  detail={[formatShortDay(due), repeat].filter(Boolean).join(" · ")}
                  trailing={due < (today ?? "") ? "overdue" : when}
                  onClick={() => setEditing(reminder)}
                />
              );
            })}
          </List>
        )}
        <div className={styles.footnote}>
          <TextButton onClick={() => setEditing("new")}>New reminder</TextButton>
        </div>
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New reminder" : "Edit reminder"}
      >
        {editing !== null && today && (
          <ReminderForm
            key={editing === "new" ? "new" : editing.id}
            reminder={editing === "new" ? null : editing}
            today={today}
            onDone={() => {
              setEditing(null);
              void mutate();
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function ReminderForm({
  reminder,
  today,
  onDone,
}: {
  reminder: Reminder | null;
  today: ISODate;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [dueOn, setDueOn] = useState(reminder ? nextDue(reminder, today) ?? reminder.due_on : today);
  const [recurrence, setRecurrence] = useState<Recurrence>(reminder?.recurrence ?? "monthly");
  const [notice, setNotice] = useState(reminder?.notify_days_before ?? 3);

  async function save(event: FormEvent) {
    event.preventDefault();
    const row = {
      title: title.trim(),
      due_on: dueOn,
      recurrence,
      notify_days_before: notice,
      // Editing the date restarts the schedule from that date.
      last_done_on: null,
      archived: false,
    };
    if (!row.title || !row.due_on) return;
    await write((db) =>
      reminder ? db.from("reminders").update(row).eq("id", reminder.id) : db.from("reminders").insert(row),
    );
    onDone();
  }

  async function remove() {
    if (reminder) await write((db) => db.from("reminders").delete().eq("id", reminder.id));
    onDone();
  }

  return (
    <form className={styles.sheetForm} onSubmit={save}>
      <TextField
        placeholder="Pay rent"
        aria-label="What"
        value={title}
        autoFocus={!reminder}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <Label text="Due">
        <TextField type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} required />
      </Label>
      <Label text="Repeats">
        <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
          {REPEATS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Label>
      <Label text="Show on Today">
        <Select value={notice} onChange={(e) => setNotice(Number(e.target.value))}>
          {NOTICE.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </Select>
      </Label>
      <div className={styles.sheetActions}>
        {reminder ? (
          <TextButton className={styles.danger} onClick={remove}>
            Delete
          </TextButton>
        ) : (
          <span />
        )}
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
