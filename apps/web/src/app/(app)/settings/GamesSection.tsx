"use client";

import { useState, type FormEvent } from "react";
import { GameIcon } from "@/components/fun/GameIcon";
import { Button, Label, List, Row, Sheet, TextButton, TextField } from "@/components/ui";
import { write } from "@/lib/db/client";
import { useGames } from "@/lib/db/hooks";
import type { Game } from "@/lib/db/types";
import styles from "./settings.module.css";

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Add, rename, re-link or remove daily games. */
export function GamesSection() {
  const { data: games, mutate } = useGames();
  const [editing, setEditing] = useState<Game | "new" | null>(null);

  return (
    <div className={styles.stack}>
      <List>
        {games.map((game) => (
          <Row
            key={game.id}
            leading={<GameIcon game={game} size={32} />}
            title={game.name}
            detail={host(game.url)}
            onClick={() => setEditing(game)}
          />
        ))}
      </List>
      <div>
        <TextButton onClick={() => setEditing("new")}>Add game</TextButton>
      </div>
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add game" : "Edit game"}
      >
        {editing !== null && (
          <GameForm
            key={editing === "new" ? "new" : editing.id}
            game={editing === "new" ? null : editing}
            nextPosition={Math.max(0, ...games.map((g) => g.position)) + 1}
            onDone={() => {
              setEditing(null);
              void mutate();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function GameForm({ game, nextPosition, onDone }: { game: Game | null; nextPosition: number; onDone: () => void }) {
  const [name, setName] = useState(game?.name ?? "");
  const [url, setUrl] = useState(game?.url ?? "https://");

  async function save(event: FormEvent) {
    event.preventDefault();
    const row = { name: name.trim(), url: url.trim() };
    if (!row.name || !/^https?:\/\/\S+\.\S+/.test(row.url)) return;
    await write((db) =>
      game
        ? db.from("games").update(row).eq("id", game.id)
        : db.from("games").insert({ ...row, position: nextPosition }),
    );
    onDone();
  }

  async function remove() {
    if (game) await write((db) => db.from("games").delete().eq("id", game.id));
    onDone();
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <Label text="Name">
        <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Bandle" required autoFocus={!game} />
      </Label>
      <Label text="Link">
        <TextField type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
      </Label>
      <div className={styles.sheetActions}>
        {game ? (
          <TextButton className={styles.danger} onClick={remove}>
            Remove game
          </TextButton>
        ) : (
          <span />
        )}
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
