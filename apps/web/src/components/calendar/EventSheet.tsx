"use client";

import { useState, type FormEvent } from "react";
import { Button, Label, Note, Select, Sheet, TextButton, TextField } from "@/components/ui";
import { addDays, formatShortDay, formatTime, toISODate, toTimestamp, type ISODate } from "@/lib/dates";
import { refresh, write } from "@/lib/db/client";
import type { CalendarEvent, CalendarSource, EventCategory } from "@/lib/db/types";
import styles from "./calendar.module.css";

const TYPES: { value: EventCategory; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "social", label: "Friends & social" },
  { value: "gym", label: "Gym & sport" },
  { value: "meal", label: "Meal" },
  { value: "lecture", label: "Uni" },
  { value: "exam", label: "Exam" },
  { value: "other", label: "Other" },
];

export type EventSheetState = { kind: "new"; day: ISODate } | { kind: "open"; event: CalendarEvent } | null;

/** Add, edit or delete your own events; feed events open read-only. */
export function EventSheet({
  state,
  sources,
  onClose,
}: {
  state: EventSheetState;
  sources: CalendarSource[];
  onClose: () => void;
}) {
  const event = state?.kind === "open" ? state.event : null;
  const source = event?.source_id ? sources.find((s) => s.id === event.source_id) : null;
  const fromFeed = source?.kind === "ics";
  const title = state?.kind === "new" ? "New event" : fromFeed ? event!.title : "Edit event";

  return (
    <Sheet open={state !== null} onClose={onClose} title={title}>
      {state && fromFeed && event && <FeedEvent event={event} sourceName={source!.name} />}
      {state && !fromFeed && (
        <EventForm
          key={event?.id ?? `new-${state.kind === "new" ? state.day : ""}`}
          event={event}
          day={state.kind === "new" ? state.day : null}
          onDone={async () => {
            await refresh("events");
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function FeedEvent({ event, sourceName }: { event: CalendarEvent; sourceName: string }) {
  const day = toISODate(new Date(event.starts_at));
  return (
    <div className={styles.form}>
      <p className={styles.when}>
        {event.all_day ? formatShortDay(event.starts_at.slice(0, 10)) : `${formatShortDay(day)} · ${formatTime(event.starts_at)}–${formatTime(event.ends_at)}`}
      </p>
      {event.location && <p>{event.location}</p>}
      {event.notes && <Note>{event.notes}</Note>}
      <Note>From {sourceName}. Changes come from that calendar, so it can’t be edited here.</Note>
    </div>
  );
}

const timeOf = (timestamp: string) => formatTime(timestamp);

function EventForm({
  event,
  day,
  onDone,
}: {
  event: CalendarEvent | null;
  day: ISODate | null;
  onDone: () => void;
}) {
  const startDay = event ? (event.all_day ? event.starts_at.slice(0, 10) : toISODate(new Date(event.starts_at))) : day!;
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState<ISODate>(startDay);
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [start, setStart] = useState(event && !event.all_day ? timeOf(event.starts_at) : "18:00");
  const [end, setEnd] = useState(event && !event.all_day ? timeOf(event.ends_at) : "19:00");
  const [location, setLocation] = useState(event?.location ?? "");
  const [category, setCategory] = useState<EventCategory>(event?.category ?? "personal");
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!allDay && end <= start) {
      setError("The end time needs to be after the start.");
      return;
    }
    const row = {
      title: title.trim(),
      location: location.trim() || null,
      category,
      all_day: allDay,
      // All-day events are stored as dates (UTC midnight, end exclusive), like calendar feeds.
      starts_at: allDay ? `${date}T00:00:00Z` : toTimestamp(date, start),
      ends_at: allDay ? `${addDays(date, 1)}T00:00:00Z` : toTimestamp(date, end),
    };
    if (!row.title) return;
    await write((db) => (event ? db.from("events").update(row).eq("id", event.id) : db.from("events").insert(row)));
    onDone();
  }

  async function remove() {
    if (event) await write((db) => db.from("events").delete().eq("id", event.id));
    onDone();
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <TextField
        placeholder="Dinner with friends"
        aria-label="What"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus={!event}
        required
      />
      <Label text="Date">
        <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Label>
      <label className={styles.toggle}>
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All day
      </label>
      {!allDay && (
        <div className={styles.times}>
          <Label text="Starts">
            <TextField type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </Label>
          <Label text="Ends">
            <TextField type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Label>
        </div>
      )}
      <Label text="Where (optional)">
        <TextField value={location} onChange={(e) => setLocation(e.target.value)} />
      </Label>
      <Label text="Type">
        <Select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Label>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        {event ? (
          <TextButton className={styles.danger} onClick={remove}>
            Delete event
          </TextButton>
        ) : (
          <span />
        )}
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
