"use client";

import { AlbumFeature } from "@/components/fun/AlbumOfTheWeek";
import { Section } from "@/components/ui";
import { useToday } from "@/lib/db/hooks";

/** This week's pick, "Pick another" and previous weeks, above the Listen list. */
export function AlbumOfTheWeekSection() {
  const today = useToday();
  return (
    <Section title="Album of the week">
      <AlbumFeature today={today} />
    </Section>
  );
}
