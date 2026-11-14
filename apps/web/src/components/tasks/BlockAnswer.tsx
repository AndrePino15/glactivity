"use client";

import { useState } from "react";
import { TextButton } from "@/components/ui";
import { answerBlock } from "@/lib/assistant/actions";
import type { BlockOutcome } from "@/lib/db/types";
import styles from "./tasks.module.css";

const MORE = [
  { label: "+30 min", minutes: 30 },
  { label: "+1 h", minutes: 60 },
  { label: "+2 h", minutes: 120 },
  { label: "Not sure", minutes: 0 },
];

/**
 * One tap after a study block: Done, Needed more (then how much more) or
 * Didn't do it. The assistant learns how long things really take from this.
 */
export function BlockAnswer({ blockId, onAnswered }: { blockId: string; onAnswered?: (outcome: BlockOutcome) => void }) {
  const [askingMore, setAskingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function answer(outcome: BlockOutcome, extra?: number) {
    setBusy(true);
    setError(false);
    try {
      await answerBlock(blockId, outcome, extra);
      onAnswered?.(outcome);
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  return (
    <div className={styles.answer}>
      {askingMore ? (
        <div className={styles.textActions} role="group" aria-label="How much more does it need?">
          {MORE.map((m) => (
            <TextButton key={m.label} disabled={busy} onClick={() => answer("more", m.minutes || undefined)}>
              {m.label}
            </TextButton>
          ))}
        </div>
      ) : (
        <div className={styles.textActions} role="group" aria-label="How did it go?">
          <TextButton disabled={busy} onClick={() => answer("done")}>
            Done
          </TextButton>
          <TextButton disabled={busy} onClick={() => setAskingMore(true)}>
            Needed more
          </TextButton>
          <TextButton disabled={busy} className={styles.quiet} onClick={() => answer("missed")}>
            Didn’t do it
          </TextButton>
        </div>
      )}
      {error && <p className={styles.error}>That didn’t save. Try again?</p>}
    </div>
  );
}
