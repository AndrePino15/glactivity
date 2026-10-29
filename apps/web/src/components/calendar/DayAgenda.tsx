"use client";

import type { CSSProperties } from "react";
import { List, Note, Row } from "@/components/ui";
import { formatTime } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/db/types";
import type { Holiday } from "@/lib/holidays";
import styles from "./calendar.module.css";

/** One day's events as a list: a coloured edge shows which kind of calendar each came from. */
export function DayAgenda({
  events,
  holidays,
  empty = "Nothing on.",
  onSelect,
}: {
  events: CalendarEvent[];
  holidays: Holiday[];
  empty?: string;
  onSelect?: (event: CalendarEvent) => void;
}) {
  if (events.length === 0 && holidays.length === 0) return <Note>{empty}</Note>;
  return (
    <List>
      {holidays.map((h) => (
        <Row
          key={`${h.country}-${h.date}`}
          leading={<Time category="holiday">All day</Time>}
          title={h.name}
          detail={h.country === "PT" ? "Feriado" : "Bank holiday"}
        />
      ))}
      {events.map((e) => (
        <Row
          key={e.id}
          leading={<Time category={e.category}>{e.all_day ? "All day" : formatTime(e.starts_at)}</Time>}
          title={e.title}
          detail={[e.all_day ? null : `until ${formatTime(e.ends_at)}`, e.location].filter(Boolean).join(" · ")}
          onClick={onSelect ? () => onSelect(e) : undefined}
        />
      ))}
    </List>
  );
}

function Time({ category, children }: { category: string; children: string }) {
  return (
    <span className={styles.time} style={{ "--cat": `var(--cat-${category})` } as CSSProperties}>
      {children}
    </span>
  );
}
