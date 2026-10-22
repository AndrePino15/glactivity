import type { Metadata } from "next";
import { BookOpen, CalendarDays, Disc3, Gamepad2, Sparkles } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Card, Placeholder, Section } from "@/components/ui";
import { TodayHeader } from "./TodayHeader";
import styles from "./today.module.css";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <TodayHeader />

      <Section title="For today">
        <Card>
          <Placeholder
            icon={<Sparkles size={22} />}
            title="A few gentle suggestions"
            hint="Ideas for your day will appear here. Take them or leave them."
          />
        </Card>
      </Section>

      <Section title="Schedule">
        <Card>
          <Placeholder
            icon={<CalendarDays size={22} />}
            title="Your day at a glance"
            hint="Lectures, gym and meals will line up here once your timetable is connected."
          />
        </Card>
      </Section>

      <Section title="Album of the week">
        <Card>
          <Placeholder
            icon={<Disc3 size={22} />}
            title="Every Monday, a new album"
            hint="Picked from your listening list, one tap to Apple Music."
          />
        </Card>
      </Section>

      <Section title="Daily games">
        <Card>
          <Placeholder
            icon={<Gamepad2 size={22} />}
            title="Wordle, Worldle and friends"
            hint="Your daily games, one tap away."
          />
        </Card>
      </Section>

      <Section title="Reading">
        <Card>
          <Placeholder
            icon={<BookOpen size={22} />}
            title="Nothing on the nightstand yet"
            hint="The book you’re reading will sit here."
          />
        </Card>
      </Section>

      <footer className={styles.footer}>
        <Mascot pose="lounging" height={96} />
        <p>That’s everything for today.</p>
      </footer>
    </>
  );
}
