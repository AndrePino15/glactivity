"use client";

import { useState, type FormEvent } from "react";
import { Section, TextButton } from "@/components/ui";
import { acceptLabel, acceptSuggestion, dismissSuggestion, tellAssistant } from "@/lib/assistant/actions";
import { formatTime, type ISODate } from "@/lib/dates";
import { useAgentBriefs, useAgentSuggestions } from "@/lib/db/hooks";
import type { AgentSuggestion } from "@/lib/db/types";
import styles from "./TodayAssistant.module.css";

/**
 * The assistant on Today: its latest brief, its ideas (nothing changes until
 * you accept one), and a box to tell it things.
 */
export function TodayAssistant({ today }: { today: ISODate }) {
  const briefs = useAgentBriefs(today);
  const suggestions = useAgentSuggestions(today);
  const brief = briefs.data.find((b) => b.slot === "evening") ?? briefs.data.find((b) => b.slot === "morning");

  return (
    <Section title="Assistant">
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
            <Idea key={s.id} suggestion={s} onAnswered={() => suggestions.mutate()} />
          ))}
        </ul>
      )}
      <TellBox />
    </Section>
  );
}

function Idea({ suggestion, onAnswered }: { suggestion: AgentSuggestion; onAnswered: () => void }) {
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
        placeholder="Tell your assistant… (dentist Tuesday 3pm)"
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
