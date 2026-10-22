"use client";

import { Check, List, Note, Row, Section } from "@/components/ui";
import { write } from "@/lib/db/client";
import { useGames, usePlays } from "@/lib/db/hooks";
import type { ISODate } from "@/lib/dates";
import type { Game } from "@/lib/db/types";
import styles from "./fun.module.css";

/**
 * Daily games. Opening one marks it played for today, so there's nothing to
 * log; the tick undoes it. `onlyUnplayed` (for Today) hides finished games
 * and the whole section once they're all played.
 */
export function DailyGames({ today, onlyUnplayed = false }: { today: ISODate | null; onlyUnplayed?: boolean }) {
  const { data: games, loaded } = useGames();
  const plays = usePlays(today);
  const played = new Set(plays.data.map((p) => p.game_id));
  const shown = onlyUnplayed ? games.filter((g) => !played.has(g.id)) : games;

  async function setPlayed(game: Game, value: boolean) {
    if (!today) return;
    const next = value
      ? [...plays.data, { game_id: game.id, played_on: today }]
      : plays.data.filter((p) => p.game_id !== game.id);
    await plays.mutate(
      async () => {
        await write((db) =>
          value
            ? db.from("game_plays").upsert({ game_id: game.id, played_on: today }, { ignoreDuplicates: true })
            : db.from("game_plays").delete().eq("game_id", game.id).eq("played_on", today),
        );
        return undefined;
      },
      { optimisticData: next, populateCache: false, revalidate: true },
    );
  }

  if (onlyUnplayed && (!loaded || !plays.loaded || shown.length === 0)) return null;

  // On Today: one quiet line of what's left to play.
  if (onlyUnplayed) {
    return (
      <Section title="Daily games">
        <div className={styles.compact}>
          {shown.map((game) => (
            <a key={game.id} href={game.url} target="_blank" rel="noreferrer" onClick={() => setPlayed(game, true)}>
              {game.name}
            </a>
          ))}
        </div>
      </Section>
    );
  }

  const list = (
    <List>
      {shown.map((game) => (
        <Row
          key={game.id}
          control={
            <Check
              checked={played.has(game.id)}
              onToggle={() => setPlayed(game, !played.has(game.id))}
              label={`${game.name} played today`}
            />
          }
          title={game.name}
          href={game.url}
          external
          onClick={() => {
            if (!played.has(game.id)) void setPlayed(game, true);
          }}
        />
      ))}
    </List>
  );
  return (
    <Section title="Daily games">
      {loaded && games.length > 0 && shown.length === 0 ? <Note>All played today.</Note> : list}
    </Section>
  );
}
