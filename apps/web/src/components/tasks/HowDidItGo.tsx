"use client";

import { Section } from "@/components/ui";
import { addDays, formatTime, relativeDay, toISODate, type ISODate } from "@/lib/dates";
import { useTasks, useWorkBlocks } from "@/lib/db/hooks";
import { useNow } from "@/lib/use-now";
import { BlockAnswer } from "./BlockAnswer";
import styles from "./tasks.module.css";

/** Study blocks from the last few days that have ended and haven't been answered yet. */
export function HowDidItGo({ today }: { today: ISODate }) {
  const now = useNow();
  const blocks = useWorkBlocks(addDays(today, -3), today);
  const tasks = useTasks();
  if (!now) return null;
  const ended = blocks.data
    .filter((b) => !b.outcome && new Date(b.ends_at) <= now)
    .sort((a, b) => b.ends_at.localeCompare(a.ends_at))
    .slice(0, 4);
  if (ended.length === 0) return null;

  return (
    <Section title="How did it go?">
      <ul className={styles.answers}>
        {ended.map((b) => {
          const task = tasks.data.find((t) => t.id === b.task_id);
          const day = toISODate(new Date(b.starts_at));
          const when = day === today ? "Today" : relativeDay(today, day).replace(/^./, (c) => c.toUpperCase());
          return (
            <li key={b.id} className={styles.answerRow}>
              <p className={`${styles.answerTitle} ${styles.wrap}`}>{task?.title ?? "Study"}</p>
              <p className={styles.answerWhen}>
                {when}, {formatTime(b.starts_at)}–{formatTime(b.ends_at)}
              </p>
              <BlockAnswer blockId={b.id} onAnswered={() => void blocks.mutate()} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
