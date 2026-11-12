"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button, List, Note, Row, Section, TextArea } from "@/components/ui";
import { runNow } from "@/lib/assistant/actions";
import { formatShortDay, formatTime, toISODate, type ISODate } from "@/lib/dates";
import { refresh, write } from "@/lib/db/client";
import type { AgentNote } from "@/lib/db/types";
import styles from "./tasks.module.css";

/**
 * Tell the assistant something in your own words (a task, a goal, an answer).
 * When Run now is set up, sending starts a check straight away.
 */
export function AskBox({
  label,
  placeholder,
  hint,
  sentHint,
  reason,
  canRunNow,
  onSend,
  rows = 3,
}: {
  label: string;
  placeholder: string;
  hint: string;
  /** What to say once it's sent, with and without Run now. */
  sentHint: { now: string; later: string };
  reason: "task" | "goal";
  canRunNow: boolean;
  onSend: (text: string) => Promise<void>;
  rows?: number;
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || state === "sending") return;
    setState("sending");
    try {
      await onSend(value);
      setText("");
      setState("sent");
      // Start a check so it's dealt with in a minute or two, and look again while it runs.
      if (canRunNow) {
        const result = await runNow(reason);
        if (result.started) {
          const timer = setInterval(() => void refresh("agent-notes", "tasks", "work-blocks", "goals", "milestones", "goal-notes"), 20_000);
          setTimeout(() => clearInterval(timer), 5 * 60_000);
        }
      }
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
        placeholder={placeholder}
        aria-label={label}
        rows={rows}
        maxLength={2000}
        autoCapitalize="sentences"
        disabled={state === "sending"}
      />
      <div className={styles.askFoot}>
        <p className={styles.hint}>
          {state === "sent" ? (canRunNow ? sentHint.now : sentHint.later) : state === "failed" ? "Couldn’t send that. Try again?" : hint}
        </p>
        <Button type="submit" disabled={!text.trim() || state === "sending"}>
          {state === "sending" ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}

/** Notes the assistant hasn't dealt with yet, each with a cross to take it back. */
export function Waiting({
  notes,
  today,
  canRunNow,
  later,
  onCancel,
}: {
  notes: AgentNote[];
  today: ISODate;
  canRunNow: boolean;
  /** What happens without Run now. */
  later: string;
  onCancel: (note: AgentNote) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <Section title="Waiting for your assistant">
      <List>
        {notes.map((n) => {
          const day = toISODate(new Date(n.created_at));
          return (
            <Row
              key={n.id}
              title={<span className={styles.wrap}>{n.body}</span>}
              detail={`Sent ${day === today ? "today" : formatShortDay(day)}, ${formatTime(n.created_at)}`}
              trailing={
                <button type="button" className={styles.remove} aria-label={`Cancel: ${n.body}`} onClick={() => onCancel(n)}>
                  <X size={16} strokeWidth={2} />
                </button>
              }
            />
          );
        })}
      </List>
      <Note>{canRunNow ? "Your assistant is on it; this usually takes a minute or two. Otherwise it’s done at the next check." : later}</Note>
    </Section>
  );
}

/** Takes back a note the assistant hasn't read yet. */
export async function cancelNote(note: AgentNote) {
  await write((db) => db.from("agent_notes").delete().eq("id", note.id));
  await refresh("agent-notes");
}
