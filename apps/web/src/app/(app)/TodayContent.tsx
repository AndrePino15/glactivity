"use client";

import { DayAgenda } from "@/components/calendar/DayAgenda";
import { DailyGames } from "@/components/fun/DailyGames";
import { TodayMeals } from "@/components/lifestyle/TodayMeals";
import { TodayAssistant } from "@/components/TodayAssistant";
import { BlockSheet } from "@/components/tasks/BlockSheet";
import { TodaySuggestions } from "@/components/TodaySuggestions";
import { TodayWorkout } from "@/components/lifestyle/TodayWorkout";
import { useState } from "react";
import { Button, Check, List, Note, Row, Section, TextButton } from "@/components/ui";
import { TodayMedia } from "./TodayMedia";
import { breakToAskAbout } from "@/lib/calendar/breaks";
import { breakOn, eventsOn, holidaysOn } from "@/lib/calendar/day";
import { addDays, formatShortDay, formatTime, fromISODate, relativeDay, toISODate, type ISODate } from "@/lib/dates";
import { write } from "@/lib/db/client";
import {
  useCalendarAutoSync,
  useEvents,
  useHolidays,
  useList,
  usePeriods,
  useProfile,
  useReminders,
  useSources,
  useTasks,
  useToday,
  useWorkBlocks,
} from "@/lib/db/hooks";
import type { CalendarEvent, Country, Period, Reminder } from "@/lib/db/types";
import { dueSoon, withBlocks } from "@/lib/tasks";
import { modeOn } from "@/lib/modes";
import { upcomingReminders } from "@/lib/reminders";
import styles from "./today.module.css";

export function TodayContent() {
  useCalendarAutoSync();
  const today = useToday();
  const { data: profile } = useProfile();
  const { data: periods, mutate: mutatePeriods } = usePeriods();
  // A week either side: upcoming exams set exam mode, recent plans inform suggestions.
  const { data: events } = useEvents(today ? addDays(today, -7) : null, today ? addDays(today, 7) : null);
  const holidays = useHolidays(today, today);
  const { data: sources, loaded: sourcesLoaded } = useSources();
  const reminders = useReminders();
  const shopping = useList("shopping");
  const tasks = useTasks();
  const blocks = useWorkBlocks(today, today);
  const [block, setBlock] = useState<CalendarEvent["block"] | null>(null);

  if (!today) return null;
  const home = profile?.current_country ?? "GB";
  const askAbout = breakToAskAbout(periods, today);
  const onBreak = breakOn(today, periods);
  const reminding = upcomingReminders(reminders.data, today, 30).filter(
    (r) => r.days <= r.reminder.notify_days_before,
  );
  const toBuy = shopping.data.filter((i) => i.status === "open");
  const shoppingDay = profile ? daysUntilWeekday(today, profile.shopping_day) : null;
  const todaysEvents = eventsOn(today, events);
  const schedule = withBlocks(todaysEvents, blocks.data, tasks.data);
  const due = dueSoon(tasks.data, today);
  const mode = modeOn(today, events, periods, home);

  async function answerBreak(period: Period, country: Country) {
    await write((db) => db.from("periods").update({ confirmed: true, country }).eq("id", period.id));
    await mutatePeriods();
  }

  async function markDone(reminder: Reminder, on: ISODate) {
    await write((db) =>
      db
        .from("reminders")
        .update({ last_done_on: on, archived: reminder.recurrence === "none" })
        .eq("id", reminder.id),
    );
    await reminders.mutate();
  }

  return (
    <>
      {askAbout && (
        <section className={styles.prompt}>
          <p>
            {askAbout.starts_on <= today ? "You’re on a break" : "Looks like a break is coming up"}: no lectures from{" "}
            {formatShortDay(askAbout.starts_on)} to {formatShortDay(askAbout.ends_on)}. Going home?
          </p>
          <div className={styles.promptActions}>
            <Button onClick={() => answerBreak(askAbout, "PT")}>Going to Portugal</Button>
            <TextButton onClick={() => answerBreak(askAbout, "GB")}>Staying in the UK</TextButton>
          </div>
        </section>
      )}

      {mode.exams.length > 0 && (
        <Section title="Exams coming up">
          <List>
            {mode.exams.map((exam) => {
              const day = toISODate(new Date(exam.starts_at));
              return (
                <Row
                  key={exam.id}
                  title={exam.title}
                  detail={`${formatShortDay(day)} · ${formatTime(exam.starts_at)}${exam.location ? ` · ${exam.location}` : ""}`}
                  trailing={relativeDay(today, day)}
                  href="/timetable"
                />
              );
            })}
          </List>
        </Section>
      )}

      <Section title="Schedule">
        {onBreak?.confirmed && onBreak.country === "PT" && <p className={styles.context}>On break · in Portugal</p>}
        <DayAgenda
          events={schedule}
          onSelect={(e) => e.block && setBlock(e.block)}
          holidays={holidaysOn(today, holidays, periods, home)}
          empty={sourcesLoaded && sources.length === 0 ? "Add your timetable link in Settings to see lectures here." : "Nothing scheduled today."}
        />
      </Section>

      {due.length > 0 && (
        <Section title="Due soon">
          <List>
            {due.map((task) => (
              <Row
                key={task.id}
                title={task.title}
                detail={task.subject ?? undefined}
                trailing={task.due_on! < today ? "overdue" : relativeDay(today, task.due_on!)}
                href="/tasks"
              />
            ))}
          </List>
        </Section>
      )}

      <TodayAssistant today={today} />

      <TodaySuggestions today={today} events={events} mode={mode} daysToShopping={shoppingDay} />

      <TodayWorkout today={today} events={todaysEvents} mode={mode} />

      <TodayMeals today={today} />

      <Section title="Reminders">
        {reminding.length === 0 ? (
          <Note>No reminders for today.</Note>
        ) : (
          <List>
            {reminding.map(({ reminder, due: on, days }) => (
              <Row
                key={reminder.id}
                control={<Check checked={false} onToggle={() => markDone(reminder, on)} label={`Done: ${reminder.title}`} />}
                title={reminder.title}
                trailing={days < 0 ? "overdue" : relativeDay(today, on)}
                href="/lists/reminders"
              />
            ))}
          </List>
        )}
      </Section>

      {/* No shopping-day nudge while you're home in Portugal. */}
      {toBuy.length > 0 && shoppingDay !== null && shoppingDay <= 1 && !mode.inPortugal && (
        <Section title="Shopping">
          <List>
            <Row
              title={shoppingDay === 0 ? "It’s shopping day" : "Shopping tomorrow"}
              detail={toBuy.slice(0, 4).map((i) => i.title).join(", ") + (toBuy.length > 4 ? "…" : "")}
              trailing={`${toBuy.length} item${toBuy.length === 1 ? "" : "s"}`}
              href="/lists/shopping"
            />
          </List>
        </Section>
      )}

      <TodayMedia today={today} />

      <DailyGames today={today} layout="grid" />

      <BlockSheet block={block ?? null} onClose={() => setBlock(null)} />
    </>
  );
}

/** 0 = today, 1 = tomorrow, … for a weekday number (0 = Sunday). */
function daysUntilWeekday(today: ISODate, weekday: number): number {
  const current = fromISODate(today).getDay();
  return (weekday - current + 7) % 7;
}
