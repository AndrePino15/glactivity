"use client";

import { Check, List, Row, Section } from "@/components/ui";
import { write } from "@/lib/db/client";
import { useGames, usePlays } from "@/lib/db/hooks";
import type { ISODate } from "@/lib/dates";
import type { Game } from "@/lib/db/types";
import { GameIcon } from "./GameIcon";
import styles from "./fun.module.css";

/**
 * Daily games. Opening one marks it played for today, so there's nothing to
 * log; the tick undoes it. Today shows them as a grid of icons, Fun as a list.
 */
export function DailyGames({ today, layout = "list" }: { today: ISODate | null; layout?: "list" | "grid" }) {
  const { data: games, loaded } = useGames();
  const plays = usePlays(today);
  const played = new Set(plays.data.map((p) => p.game_id));

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

  if (!loaded || games.length === 0) return null;
  const left = games.filter((g) => !played.has(g.id)).length;

  if (layout === "grid") {
    return (
      <Section
        title="Daily games"
        action={<span className={styles.count}>{left === 0 ? "All played" : `${left} to play`}</span>}
      >
        <ul className={styles.grid}>
          {games.map((game) => (
            <li key={game.id}>
              <a
                href={game.url}
                target="_blank"
                rel="noreferrer"
                className={styles.tile}
                data-played={played.has(game.id) || undefined}
                onClick={() => {
                  if (!played.has(game.id)) void setPlayed(game, true);
                }}
              >
                <span className={styles.tileIcon}>
                  <GameIcon game={game} size={52} />
                  {played.has(game.id) && <span className={styles.badge} aria-label="Played today" />}
                </span>
                <span className={styles.tileName}>{game.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  return (
    <Section title="Daily games">
      <List>
        {games.map((game) => (
          <Row
            key={game.id}
            leading={<GameIcon game={game} size={36} />}
            title={game.name}
            href={game.url}
            external
            onClick={() => {
              if (!played.has(game.id)) void setPlayed(game, true);
            }}
            trailing={
              <Check
                checked={played.has(game.id)}
                onToggle={() => setPlayed(game, !played.has(game.id))}
                label={`${game.name} played today`}
              />
            }
          />
        ))}
      </List>
    </Section>
  );
}
