"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Section, TextButton } from "@/components/ui";
import { acceptLabel, acceptSuggestion, dismissSuggestion, runNow, tellAssistant } from "@/lib/assistant/actions";
import { refresh } from "@/lib/db/client";
import { addDays, formatShortDay, formatTime, type ISODate } from "@/lib/dates";
import { useAgentBriefs, useAgentSuggestions, useRunNow } from "@/lib/db/hooks";
import type { AgentSuggestion } from "@/lib/db/types";
import styles from "./TodayAssistant.module.css";

/**
 * The assistant on Today: its latest brief, its ideas (nothing changes until
 * you accept one), and a box to tell it things.
 */
export function TodayAssistant({ today }: { today: ISODate }) {
  const briefs = useAgentBriefs(today);
  const suggestions = useAgentSuggestions(today);
  // The latest brief written today.
  const brief = [...briefs.data].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const run = useRunCheck();

  return (
    <Section
      title="Assistant"
      action={
        run.available && (
          <TextButton onClick={run.start} disabled={run.state === "starting"}>
            {run.state === "starting" ? "Starting…" : "Run now"}
          </TextButton>
        )
      }
    >
      {run.message && <p className={styles.meta}>{run.message}</p>}
      {brief && (
        <div className={styles.brief}>
          <p>{brief.body}</p>
          <p className={styles.meta}>
            {brief.slot === "morning" ? "Morning" : "Evening"} brief · {formatTime(brief.created_at)}
          </p>
        </div>
      )}
      {suggestions.data.length > 0 && (
        <ul className={styles.ideas}>
          {suggestions.data.map((s) => (
            <Idea key={s.id} suggestion={s} today={today} onAnswered={() => suggestions.mutate()} />
          ))}
        </ul>
      )}
      <TellBox />
    </Section>
  );
}

function Idea({ suggestion, today, onAnswered }: { suggestion: AgentSuggestion; today: ISODate; onAnswered: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      onAnswered();
    } catch {
      setError("That didn’t work. Try again?");
      setBusy(false);
    }
  }

  return (
    <li className={styles.idea}>
      {suggestion.day !== today && (
        <p className={styles.meta}>{suggestion.day === addDays(today, 1) ? "Tomorrow" : formatShortDay(suggestion.day)}</p>
      )}
      <p className={styles.title}>{suggestion.title}</p>
      {suggestion.detail && <p className={styles.detail}>{suggestion.detail}</p>}
      <div className={styles.actions}>
        <TextButton disabled={busy} onClick={() => answer(() => acceptSuggestion(suggestion.id))}>
          {acceptLabel(suggestion.change)}
        </TextButton>
        <TextButton
          disabled={busy}
          className={styles.quiet}
          onClick={() => answer(() => dismissSuggestion(suggestion.id))}
        >
          Not now
        </TextButton>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </li>
  );
}

function TellBox() {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || state === "saving") return;
    setState("saving");
    setText("");
    try {
      await tellAssistant(value);
      setState("saved");
    } catch {
      setText(value); // keep what was typed so nothing is lost
      setState("failed");
    }
  }

  return (
    <form onSubmit={submit} className={styles.tell}>
      <input
        className={styles.input}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (state !== "saving") setState("idle");
        }}
        placeholder="Tell your assistant something…"
        aria-label="Tell your assistant"
        enterKeyHint="send"
        autoCapitalize="sentences"
        maxLength={1000}
        disabled={state === "saving"}
      />
      {state === "saved" && <p className={styles.meta}>Noted. It’ll plan around this on its next check.</p>}
      {state === "failed" && <p className={styles.error}>Couldn’t save that. Try again?</p>}
    </form>
  );
}

/**
 * "Run now": starts the assistant's check, then refreshes Today every 20
 * seconds for a few minutes so the new brief and ideas appear by themselves.
 */
function useRunCheck() {
  const status = useRunNow();
  const [state, setState] = useState<"idle" | "starting" | "running">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "running") return;
    const timer = setInterval(() => void refresh("agent-", "work-blocks", "tasks"), 20_000);
    const stop = setTimeout(() => {
      setState("idle");
      setMessage(null);
    }, 5 * 60_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [state]);

  async function start() {
    setState("starting");
    setMessage(null);
    const result = await runNow();
    if (result.started) {
      setState("running");
      setMessage("Checking now. The brief and ideas update here in a minute or two.");
    } else {
      setState("idle");
      setMessage(result.message);
    }
  }

  return { available: status.data.connected, state, message, start };
}
