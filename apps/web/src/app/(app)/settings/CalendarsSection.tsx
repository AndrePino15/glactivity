"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, Label, List, Note, Row, Select, Sheet, TextButton, TextField } from "@/components/ui";
import { write } from "@/lib/db/client";
import { syncCalendars, useSources } from "@/lib/db/hooks";
import type { CalendarSource, EventCategory } from "@/lib/db/types";
import styles from "./settings.module.css";

const KINDS: { value: EventCategory; label: string }[] = [
  { value: "lecture", label: "Lectures" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

function status(source: CalendarSource): string {
  if (source.kind === "exam_paste") return "Pasted exam timetable";
  if (source.last_error) return source.last_error;
  if (!source.last_synced_at) return "Not updated yet";
  const minutes = Math.round((Date.now() - new Date(source.last_synced_at).getTime()) / 60_000);
  if (minutes < 2) return "Updated just now";
  if (minutes < 90) return `Updated ${minutes} min ago`;
  return `Updated ${Math.round(minutes / 60)} h ago`;
}

export function CalendarsSection() {
  const { data: sources, loaded, mutate } = useSources();
  const [sheet, setSheet] = useState<CalendarSource | "new" | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function syncNow() {
    setSyncing(true);
    await syncCalendars();
    setSyncing(false);
  }

  return (
    <div className={styles.stack}>
      {loaded && sources.length === 0 && (
        <Note>
          Add your University of Southampton timetable link (and any other calendar link) to see lectures on Today and
          in Timetable.
        </Note>
      )}
      {sources.length > 0 && (
        <List>
          {sources.map((source) => (
            <Row key={source.id} title={source.name} detail={status(source)} onClick={() => setSheet(source)} />
          ))}
        </List>
      )}
      <div className={styles.actions}>
        <TextButton onClick={() => setSheet("new")}>Add calendar link</TextButton>
        <Link href="/settings/exams" className={styles.link}>
          Paste exam timetable
        </Link>
        {sources.some((s) => s.kind === "ics") && (
          <TextButton onClick={syncNow} disabled={syncing}>
            {syncing ? "Updating…" : "Update now"}
          </TextButton>
        )}
      </div>

      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === "new" ? "Add calendar" : (sheet?.name ?? "")}
      >
        {sheet === "new" && (
          <AddCalendarForm
            onDone={() => {
              setSheet(null);
              void mutate();
            }}
          />
        )}
        {sheet && sheet !== "new" && (
          <CalendarActions
            source={sheet}
            onDone={() => {
              setSheet(null);
              void mutate();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function AddCalendarForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("University timetable");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<EventCategory>("lecture");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await write((db) =>
        db.from("calendar_sources").insert({
          name: name.trim() || "Calendar",
          kind: "ics",
          url: url.trim(),
          default_category: category,
        }),
      );
      await syncCalendars();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add that calendar");
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <Label text="Name">
        <TextField value={name} onChange={(e) => setName(e.target.value)} required />
      </Label>
      <Label text="Calendar link (iCal / webcal)">
        <TextField
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value.replace(/^webcals?:\/\//i, "https://"))}
          required
        />
      </Label>
      <Label text="What’s in it">
        <Select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Label>
      <Note>The link is private to you and stays in your database. Breaks are spotted from lecture calendars.</Note>
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? "Adding…" : "Add calendar"}
      </Button>
    </form>
  );
}

function CalendarActions({ source, onDone }: { source: CalendarSource; onDone: () => void }) {
  async function remove() {
    await write((db) => db.from("calendar_sources").delete().eq("id", source.id));
    onDone();
  }
  return (
    <div className={styles.form}>
      <Note>{status(source)}</Note>
      <Note>Removing it also removes its events from Glactivity. The calendar itself isn’t touched.</Note>
      <div>
        <TextButton className={styles.danger} onClick={remove}>
          Remove calendar
        </TextButton>
      </div>
    </div>
  );
}
