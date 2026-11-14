"use client";

import { useState, type FormEvent } from "react";
import { Button, Label, Note, Sheet, TextButton, TextField } from "@/components/ui";
import { formatShortDay, formatTime, toISODate, toTimestamp } from "@/lib/dates";
import { refresh, write } from "@/lib/db/client";
import type { CalendarEvent } from "@/lib/db/types";
import { BlockAnswer } from "./BlockAnswer";
import styles from "./tasks.module.css";

type Block = NonNullable<CalendarEvent["block"]>;

const OUTCOME = { done: "done", more: "needed more", missed: "didn’t do it" } as const;

/** A study block: keep, move or skip it (tentative ones were pencilled in by the assistant). */
export function BlockSheet({ block, onClose }: { block: Block | null; onClose: () => void }) {
  return (
    <Sheet open={block !== null} onClose={onClose} title={block?.task?.title ?? "Study"}>
      {block && <BlockBody key={block.id} block={block} onDone={onClose} />}
    </Sheet>
  );
}

function BlockBody({ block, onDone }: { block: Block; onDone: () => void }) {
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(toISODate(new Date(block.starts_at)));
  const [start, setStart] = useState(formatTime(block.starts_at));
  const [end, setEnd] = useState(formatTime(block.ends_at));
  const [error, setError] = useState<string | null>(null);
  const tentative = block.status === "tentative";
  const ended = new Date(block.ends_at) <= new Date();

  async function update(row: Record<string, unknown>) {
    try {
      await write((db) => db.from("work_blocks").update(row).eq("id", block.id));
      await refresh("work-blocks", "tasks");
      onDone();
    } catch {
      setError("That didn’t save. Try again?");
    }
  }

  function move(e: FormEvent) {
    e.preventDefault();
    if (end <= start) {
      setError("The end time needs to be after the start.");
      return;
    }
    void update({ starts_at: toTimestamp(date, start), ends_at: toTimestamp(date, end), status: "planned" });
  }

  const when = `${formatShortDay(toISODate(new Date(block.starts_at)))} · ${formatTime(block.starts_at)}–${formatTime(block.ends_at)}`;

  return (
    <div className={styles.form}>
      <p className={styles.when}>{when}</p>
      {!ended && tentative && <Note>Pencilled in by your assistant. Keep it, move it, or skip it and it’ll plan around that.</Note>}
      {block.note && <Note>{block.note}</Note>}
      {ended ? (
        <>
          <Note>
            {block.outcome
              ? `You said: ${OUTCOME[block.outcome]}. Change it if that’s not right.`
              : "How did it go? Your assistant learns how long things really take you from this."}
          </Note>
          <BlockAnswer
            blockId={block.id}
            onAnswered={() => {
              void refresh("work-blocks", "tasks");
              onDone();
            }}
          />
        </>
      ) : moving ? (
        <form className={styles.form} onSubmit={move}>
          <Label text="Date">
            <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Label>
          <div className={styles.times}>
            <Label text="Starts">
              <TextField type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </Label>
            <Label text="Ends">
              <TextField type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </Label>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <TextButton onClick={() => setMoving(false)}>Cancel</TextButton>
            <Button type="submit">Save time</Button>
          </div>
        </form>
      ) : (
        <>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <div className={styles.textActions}>
              <TextButton onClick={() => setMoving(true)}>Move</TextButton>
              <TextButton className={styles.quiet} onClick={() => update({ status: "skipped" })}>
                Skip
              </TextButton>
            </div>
            {tentative && <Button onClick={() => update({ status: "planned" })}>Keep</Button>}
          </div>
        </>
      )}
    </div>
  );
}
