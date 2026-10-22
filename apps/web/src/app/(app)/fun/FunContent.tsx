"use client";

import { Cover } from "@/components/Cover";
import { AlbumFeature } from "@/components/fun/AlbumOfTheWeek";
import { DailyGames } from "@/components/fun/DailyGames";
import { List, Row, Section } from "@/components/ui";
import { useList, useToday } from "@/lib/db/hooks";

export function FunContent() {
  const today = useToday();
  const books = useList("books");
  const movies = useList("movies");
  const now = [
    ...books.data.filter((b) => b.status === "active").map((item) => ({ item, verb: "Reading" })),
    ...movies.data.filter((m) => m.status === "active").map((item) => ({ item, verb: "Watching" })),
  ];

  return (
    <>
      <Section title="Album of the week">
        <AlbumFeature today={today} />
      </Section>

      <DailyGames today={today} />

      {now.length > 0 && (
        <Section title="On the go">
          <List>
            {now.map(({ item, verb }) => (
              <Row
                key={item.id}
                leading={<Cover src={item.meta.artwork} size={40} shape="portrait" />}
                title={item.title}
                detail={[verb, item.subtitle].filter(Boolean).join(" · ")}
                href={verb === "Reading" ? "/lists/read" : "/lists/watch"}
              />
            ))}
          </List>
        </Section>
      )}
    </>
  );
}
