"use client";

import { DayAgenda } from "@/components/calendar/DayAgenda";
import { DailyGames } from "@/components/fun/DailyGames";
import { Button, Check, List, Note, Row, Section, TextButton } from "@/components/ui";
import { TodayMedia } from "./TodayMedia";
import { breakToAskAbout } from "@/lib/calendar/breaks";
import { breakOn, eventsOn, holidaysOn } from "@/lib/calendar/day";
import { formatShortDay, fromISODate, relativeDay, type ISODate } from "@/lib/dates";
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
  useToday,
} from "@/lib/db/hooks";
import type { Country, Period, Reminder } from "@/lib/db/types";
import { upcomingReminders } from "@/lib/reminders";
import styles from "./today.module.css";

export function TodayContent() {
  useCalendarAutoSync();
  const today = useToday();
  const { data: profile } = useProfile();
  const { data: periods, mutate: mutatePeriods } = usePeriods();
  const { data: events } = useEvents(today, today);
  const holidays = useHolidays(today, today);
  const { data: sources, loaded: sourcesLoaded } = useSources();
  const reminders = useReminders();
  const shopping = useList("shopping");

  if (!today) return null;
  const home = profile?.current_country ?? "GB";
  const askAbout = breakToAskAbout(periods, today);
  const onBreak = breakOn(today, periods);
  const due = upcomingReminders(reminders.data, today, 30).filter(
    (r) => r.days <= r.reminder.notify_days_before,
  );
  const toBuy = shopping.data.filter((i) => i.status === "open");
  const shoppingDay = profile ? daysUntilWeekday(today, profile.shopping_day) : null;

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

      <Section title="Schedule">
        {onBreak?.confirmed && onBreak.country === "PT" && <p className={styles.context}>On break · in Portugal</p>}
        <DayAgenda
          events={eventsOn(today, events)}
          holidays={holidaysOn(today, holidays, periods, home)}
          empty={sourcesLoaded && sources.length === 0 ? "Add your timetable link in Settings to see lectures here." : "Nothing scheduled today."}
        />
      </Section>

      <Section title="Reminders">
        {due.length === 0 ? (
          <Note>No reminders for today.</Note>
        ) : (
          <List>
            {due.map(({ reminder, due: on, days }) => (
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

      {toBuy.length > 0 && shoppingDay !== null && shoppingDay <= 1 && (
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
    </>
  );
}

/** 0 = today, 1 = tomorrow, … for a weekday number (0 = Sunday). */
function daysUntilWeekday(today: ISODate, weekday: number): number {
  const current = fromISODate(today).getDay();
  return (weekday - current + 7) % 7;
}
