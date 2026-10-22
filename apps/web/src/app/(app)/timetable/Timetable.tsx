"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayAgenda } from "@/components/calendar/DayAgenda";
import { Note, PageHeader, Section, TextButton } from "@/components/ui";
import { breakOn, eventsOn, holidaysOn } from "@/lib/calendar/day";
import { addDays, fromISODate, startOfWeek, type ISODate } from "@/lib/dates";
import {
  useCalendarAutoSync,
  useEvents,
  useHolidays,
  usePeriods,
  useProfile,
  useSources,
  useToday,
} from "@/lib/db/hooks";
import styles from "./timetable.module.css";

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "narrow" });
const dayHeading = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const monthHeading = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export function Timetable() {
  useCalendarAutoSync();
  const today = useToday();
  const [picked, setPicked] = useState<ISODate | null>(null);
  const selected = picked ?? today;
  const week = selected ? startOfWeek(selected) : null;
  const days = week ? Array.from({ length: 7 }, (_, i) => addDays(week, i)) : [];
  const weekEnd = week ? addDays(week, 6) : null;

  const { data: events } = useEvents(week, weekEnd);
  const holidays = useHolidays(week, weekEnd);
  const { data: periods } = usePeriods();
  const { data: profile } = useProfile();
  const { data: sources, loaded: sourcesLoaded } = useSources();
  const home = profile?.current_country ?? "GB";

  const dayEvents = selected ? eventsOn(selected, events) : [];
  const dayHolidays = selected ? holidaysOn(selected, holidays, periods, home) : [];
  const onBreak = selected ? breakOn(selected, periods) : null;

  return (
    <>
      <PageHeader
        eyebrow={week ? monthHeading.format(fromISODate(selected!)) : " "}
        title="Timetable"
        action={
          <div className={styles.weekNav}>
            <button type="button" aria-label="Previous week" onClick={() => selected && setPicked(addDays(selected, -7))}>
              <ChevronLeft size={22} strokeWidth={1.8} />
            </button>
            <button type="button" aria-label="Next week" onClick={() => selected && setPicked(addDays(selected, 7))}>
              <ChevronRight size={22} strokeWidth={1.8} />
            </button>
          </div>
        }
      />

      <div className={styles.strip} role="tablist" aria-label="Days">
        {days.map((day) => {
          const busy = eventsOn(day, events).length > 0 || holidaysOn(day, holidays, periods, home).length > 0;
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={day === selected}
              aria-label={dayHeading.format(fromISODate(day))}
              className={styles.day}
              data-today={day === today || undefined}
              onClick={() => setPicked(day)}
            >
              <span className={styles.dayName}>{weekday.format(fromISODate(day))}</span>
              <span className={styles.dayNumber}>{Number(day.slice(8))}</span>
              <span className={styles.dot} data-on={busy || undefined} />
            </button>
          );
        })}
      </div>

      {selected && (
        <Section
          title={selected === today ? "Today" : dayHeading.format(fromISODate(selected))}
          action={selected !== today ? <TextButton onClick={() => setPicked(null)}>Back to today</TextButton> : undefined}
        >
          {onBreak && (
            <p className={styles.breakNote}>
              {onBreak.confirmed && onBreak.country === "PT"
                ? "Break · in Portugal"
                : onBreak.confirmed
                  ? "Break"
                  : "Looks like a break: no lectures"}
            </p>
          )}
          <DayAgenda events={dayEvents} holidays={dayHolidays} />
        </Section>
      )}

      {sourcesLoaded && sources.length === 0 && (
        <div className={styles.footer}>
          <Note>
            No calendars yet. <Link href="/settings" className={styles.link}>Add your timetable link</Link> in Settings.
          </Note>
        </div>
      )}
    </>
  );
}
