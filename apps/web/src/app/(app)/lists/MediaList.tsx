"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Cover } from "@/components/Cover";
import { Button, List, Note, Row, Section, Sheet, TextButton, TextField } from "@/components/ui";
import { write } from "@/lib/db/client";
import { useList } from "@/lib/db/hooks";
import type { ItemStatus, ListItem } from "@/lib/db/types";
import type { SearchKind, SearchResult } from "@/lib/search";
import styles from "./lists.module.css";

type Copy = {
  noun: string;
  placeholder: string;
  active: string | null;
  open: string;
  done: string;
  start: string | null;
  finish: string;
  shape: "square" | "portrait";
  empty: string;
};

export const COPY: Record<SearchKind, Copy> = {
  movies: {
    noun: "film or show",
    placeholder: "Add a film or show",
    active: "Watching now",
    open: "To watch",
    done: "Watched",
    start: "Watching now",
    finish: "Watched it",
    shape: "portrait",
    empty: "Films and shows you want to see. Search to add one with its poster.",
  },
  books: {
    noun: "book",
    placeholder: "Add a book",
    active: "Reading now",
    open: "To read",
    done: "Read",
    start: "Reading now",
    finish: "Finished it",
    shape: "portrait",
    empty: "Books you want to read. The one you’re reading shows on Today.",
  },
  albums: {
    noun: "album",
    placeholder: "Add an album",
    active: "This week’s album",
    open: "Up next",
    done: "Heard",
    start: null,
    finish: "Heard it",
    shape: "square",
    empty: "Albums you want to hear. Every Monday one of them becomes the album of the week.",
  },
};

const fetchResults = async (url: string): Promise<SearchResult[]> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Search is unavailable right now");
  return response.json();
};

/** Waits until typing pauses before searching. */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function MediaList({ kind }: { kind: SearchKind }) {
  const copy = COPY[kind];
  const { data: items, loaded, mutate } = useList(kind);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ListItem | null>(null);
  const term = useDebounced(query.trim(), 350);
  const { data: results, error, isLoading } = useSWR(
    term.length >= 2 ? `/api/search?kind=${kind}&q=${encodeURIComponent(term)}` : null,
    fetchResults,
    { revalidateOnFocus: false },
  );

  async function add(result: Pick<SearchResult, "title" | "subtitle" | "artwork" | "url" | "year">) {
    setQuery("");
    const meta = Object.fromEntries(
      Object.entries({ artwork: result.artwork, url: result.url, year: result.year }).filter(([, v]) => v),
    );
    await write((db) =>
      db.from("list_items").insert({ list: kind, title: result.title, subtitle: result.subtitle, meta }),
    );
    await mutate();
  }

  const groups: [string | null, ItemStatus][] = [
    [copy.active, "active"],
    [copy.open, "open"],
    [copy.done, "done"],
  ];

  return (
    <>
      <div className={styles.addForm}>
        <TextField
          type="search"
          placeholder={copy.placeholder}
          aria-label={copy.placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query.trim().length >= 2 && (
        <div className={styles.results}>
          {isLoading && <div className={styles.searchStatus}><Note>Searching…</Note></div>}
          {error && <div className={styles.searchStatus}><Note>{error.message}</Note></div>}
          <List>
            {(results ?? []).map((r, i) => (
              <Row
                key={`${r.title}-${i}`}
                leading={<Cover src={r.artwork} size={40} shape={copy.shape} />}
                title={r.title}
                detail={[r.subtitle, r.year].filter(Boolean).join(" · ")}
                onClick={() => add(r)}
              />
            ))}
            <Row
              title={`Add “${query.trim()}”`}
              detail="Without a cover"
              onClick={() => add({ title: query.trim(), subtitle: null, artwork: null, url: null, year: null })}
            />
          </List>
        </div>
      )}

      {loaded && items.length === 0 && !query && <Note>{copy.empty}</Note>}

      {groups.map(([title, status]) => {
        const group = items.filter((i) => i.status === status);
        if (!title || group.length === 0) return null;
        const shown = status === "done" ? group.slice(-12).reverse() : group;
        return (
          <Section key={status} title={title}>
            <List>
              {shown.map((item) => (
                <Row
                  key={item.id}
                  leading={<Cover src={item.meta.artwork} size={40} shape={copy.shape} />}
                  title={item.title}
                  detail={[item.subtitle, item.meta.year].filter(Boolean).join(" · ")}
                  onClick={() => setSelected(item)}
                />
              ))}
            </List>
          </Section>
        );
      })}

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected?.title ?? ""}>
        {selected && (
          <ItemActions
            item={selected}
            copy={copy}
            onDone={() => {
              setSelected(null);
              void mutate();
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function ItemActions({ item, copy, onDone }: { item: ListItem; copy: Copy; onDone: () => void }) {
  async function setStatus(status: ItemStatus) {
    await write((db) =>
      db
        .from("list_items")
        .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
        .eq("id", item.id),
    );
    onDone();
  }

  async function remove() {
    await write((db) => db.from("list_items").delete().eq("id", item.id));
    onDone();
  }

  return (
    <div className={styles.sheetForm}>
      {item.subtitle && <Note>{item.subtitle}</Note>}
      {item.status !== "active" && copy.start && <Button onClick={() => setStatus("active")}>{copy.start}</Button>}
      {item.status !== "done" && <Button onClick={() => setStatus("done")}>{copy.finish}</Button>}
      {item.status !== "open" && (
        <TextButton onClick={() => setStatus("open")}>Back to “{copy.open}”</TextButton>
      )}
      <div className={styles.sheetActions}>
        <TextButton className={styles.danger} onClick={remove}>
          Remove
        </TextButton>
        {item.meta.url && (
          <a className={styles.link} href={item.meta.url} target="_blank" rel="noreferrer">
            Open link
          </a>
        )}
      </div>
    </div>
  );
}
