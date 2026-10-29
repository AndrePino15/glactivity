"use client";

import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { DayAgenda } from "@/components/calendar/DayAgenda";
import { EventSheet, type EventSheetState } from "@/components/calendar/EventSheet";
import { Note, PageHeader, Section, Segmented, TextButton, TextLink } from "@/components/ui";
import { breakOn, eventsOn, holidaysOn } from "@/lib/calendar/day";
import { addDays, addMonths, fromISODate, monthGrid, startOfWeek, type ISODate } from "@/lib/dates";
import {
  useCalendarAutoSync,
  useEvents,
  useHolidays,
  usePeriods,
  useProfile,
  useSources,
  useToday,
} from "@/lib/db/hooks";
import type { CalendarEvent, Period } from "@/lib/db/types";
import type { Holiday } from "@/lib/holidays";
import styles from "./timetable.module.css";

type View = "day" | "week" | "month";

const VIEWS: { value: View; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const narrowWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "narrow" });
const shortWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

const fmt = (format: Intl.DateTimeFormat, day: ISODate) => format.format(fromISODate(day));

export function Timetable() {
  useCalendarAutoSync();
  const today = useToday();
  const [view, setView] = useState<View>("day");
  const [picked, setPicked] = useState<ISODate | null>(null);
  const [sheet, setSheet] = useState<EventSheetState>(null);
  const selected = picked ?? today;

  // The range each view needs.
  const week = selected ? startOfWeek(selected) : null;
  const grid = selected ? monthGrid(selected) : [];
  const from = view === "month" ? (grid[0] ?? null) : week;
  const to = view === "month" ? (grid[41] ?? null) : week ? addDays(week, 6) : null;

  const { data: events } = useEvents(from, to);
  const holidays = useHolidays(from, to);
  const { data: periods } = usePeriods();
  const { data: profile } = useProfile();
  const { data: sources, loaded: sourcesLoaded } = useSources();
  const home = profile?.current_country ?? "GB";
  const ctx = { events, holidays, periods, home };

  function step(direction: 1 | -1) {
    if (!selected) return;
    setPicked(view === "month" ? addMonths(selected, direction) : addDays(selected, (view === "day" ? 1 : 7) * direction));
  }

  const heading = !selected
    ? " "
    : view === "month"
      ? fmt(monthYear, selected)
      : view === "week"
        ? `${fmt(dayMonth, week!)} – ${fmt(dayMonth, addDays(week!, 6))}`
        : selected === today
          ? `Today · ${fmt(dayMonth, selected)}`
          : fmt(longDay, selected);

  return (
    <>
      <PageHeader
        title="Timetable"
        action={
          <button
            type="button"
            className={styles.iconButton}
            aria-label="New event"
            onClick={() => selected && setSheet({ kind: "new", day: selected })}
          >
            <Plus size={22} strokeWidth={1.8} />
          </button>
        }
      />

      <div className={styles.controls}>
        <Segmented<View> label="View" value={view} options={VIEWS} onChange={setView} />
        <div className={styles.stepper}>
          <button type="button" className={styles.iconButton} aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft size={20} strokeWidth={1.8} />
          </button>
          <p className={styles.heading}>{heading}</p>
          <button type="button" className={styles.iconButton} aria-label="Next" onClick={() => step(1)}>
            <ChevronRight size={20} strokeWidth={1.8} />
          </button>
          {selected !== today && (
            <TextButton className={styles.todayButton} onClick={() => setPicked(null)}>
              Today
            </TextButton>
          )}
        </div>
      </div>

      {selected && view === "day" && (
        <>
          <WeekStrip week={week!} selected={selected} today={today} ctx={ctx} onPick={setPicked} />
          <DaySection day={selected} ctx={ctx} onSelect={(event) => setSheet({ kind: "open", event })} />
        </>
      )}

      {selected && view === "week" && (
        <div className={styles.weekList}>
          {Array.from({ length: 7 }, (_, i) => addDays(week!, i)).map((day) => (
            <section key={day} className={styles.weekDay} data-today={day === today || undefined}>
              <button type="button" className={styles.weekDayHead} onClick={() => { setPicked(day); setView("day"); }}>
                <span className={styles.weekDayName}>{fmt(shortWeekday, day)}</span>
                <span className={styles.weekDayNumber}>{Number(day.slice(8))}</span>
              </button>
              <div className={styles.weekDayBody}>
                <DayAgenda
                  events={eventsOn(day, events)}
                  holidays={holidaysOn(day, holidays, periods, home)}
                  empty="Nothing on"
                  onSelect={(event) => setSheet({ kind: "open", event })}
                />
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && view === "month" && (
        <>
          <MonthGrid grid={grid} month={selected.slice(0, 7)} selected={selected} today={today} ctx={ctx} onPick={setPicked} />
          <DaySection day={selected} ctx={ctx} onSelect={(event) => setSheet({ kind: "open", event })} />
        </>
      )}

      {sourcesLoaded && sources.length === 0 && (
        <div className={styles.footer}>
          <Note>
            No calendars yet. <TextLink href="/settings">Add your timetable link</TextLink> in Settings.
          </Note>
        </div>
      )}

      <EventSheet state={sheet} sources={sources} onClose={() => setSheet(null)} />
    </>
  );
}

type Context = { events: CalendarEvent[]; holidays: Holiday[]; periods: Period[]; home: "GB" | "PT" };

function DaySection({ day, ctx, onSelect }: { day: ISODate; ctx: Context; onSelect: (e: CalendarEvent) => void }) {
  const onBreak = breakOn(day, ctx.periods);
  return (
    <Section>
      {onBreak && (
        <p className={styles.breakNote}>
          {onBreak.confirmed && onBreak.country === "PT"
            ? "Break · in Portugal"
            : onBreak.confirmed
              ? "Break"
              : "Looks like a break: no lectures"}
        </p>
      )}
      <DayAgenda
        events={eventsOn(day, ctx.events)}
        holidays={holidaysOn(day, ctx.holidays, ctx.periods, ctx.home)}
        onSelect={onSelect}
      />
    </Section>
  );
}

function WeekStrip({
  week,
  selected,
  today,
  ctx,
  onPick,
}: {
  week: ISODate;
  selected: ISODate;
  today: ISODate | null;
  ctx: Context;
  onPick: (day: ISODate) => void;
}) {
  return (
    <div className={styles.strip} role="tablist" aria-label="Days">
      {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((day) => {
        const busy = eventsOn(day, ctx.events).length + holidaysOn(day, ctx.holidays, ctx.periods, ctx.home).length > 0;
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={day === selected}
            aria-label={fmt(longDay, day)}
            className={styles.day}
            data-today={day === today || undefined}
            onClick={() => onPick(day)}
          >
            <span className={styles.dayName}>{fmt(narrowWeekday, day)}</span>
            <span className={styles.dayNumber}>{Number(day.slice(8))}</span>
            <span className={styles.dot} data-on={busy || undefined} />
          </button>
        );
      })}
    </div>
  );
}

function MonthGrid({
  grid,
  month,
  selected,
  today,
  ctx,
  onPick,
}: {
  grid: ISODate[];
  month: string;
  selected: ISODate;
  today: ISODate | null;
  ctx: Context;
  onPick: (day: ISODate) => void;
}) {
  return (
    <div className={styles.month}>
      {grid.slice(0, 7).map((day) => (
        <span key={`h-${day}`} className={styles.monthHead}>
          {fmt(narrowWeekday, day)}
        </span>
      ))}
      {grid.map((day) => {
        const dayEvents = eventsOn(day, ctx.events);
        const holiday = holidaysOn(day, ctx.holidays, ctx.periods, ctx.home).length > 0;
        const kinds = [...new Set(dayEvents.map((e) => e.category))].slice(0, 3);
        return (
          <button
            key={day}
            type="button"
            className={styles.monthDay}
            aria-label={fmt(longDay, day)}
            aria-pressed={day === selected}
            data-today={day === today || undefined}
            data-outside={!day.startsWith(month) || undefined}
            onClick={() => onPick(day)}
          >
            <span className={styles.monthNumber}>{Number(day.slice(8))}</span>
            <span className={styles.monthDots}>
              {holiday && <span className={styles.monthDot} style={{ "--cat": "var(--cat-holiday)" } as CSSProperties} />}
              {kinds.map((kind) => (
                <span key={kind} className={styles.monthDot} style={{ "--cat": `var(--cat-${kind})` } as CSSProperties} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
