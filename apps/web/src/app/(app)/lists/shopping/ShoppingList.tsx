"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Check, EmptyState, List, Note, Row, Section, Sheet, TextButton, TextField } from "@/components/ui";
import { write } from "@/lib/db/client";
import { useList, useProfile, useToday } from "@/lib/db/hooks";
import type { ListItem } from "@/lib/db/types";
import { fromISODate } from "@/lib/dates";
import { clearTickedBefore } from "@/lib/shopping";
import styles from "../lists.module.css";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ShoppingList() {
  const today = useToday();
  const { data: profile } = useProfile();
  const { data: items, loaded, mutate } = useList("shopping");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<ListItem | null>(null);

  const open = items.filter((i) => i.status !== "done");
  const basket = items.filter((i) => i.status === "done");

  // Ticked items stay in the basket until shopping day is over.
  useEffect(() => {
    if (!loaded || !today || !profile) return;
    const cutoff = fromISODate(clearTickedBefore(today, profile.shopping_day)).getTime();
    const old = items.filter(
      (i) => i.status === "done" && i.completed_at && new Date(i.completed_at).getTime() < cutoff,
    );
    if (!old.length) return;
    const ids = old.map((i) => i.id);
    void mutate(
      async () => {
        await write((db) => db.from("list_items").delete().in("id", ids));
        return items.filter((i) => !ids.includes(i.id));
      },
      { optimisticData: items.filter((i) => !ids.includes(i.id)), revalidate: true },
    );
  }, [loaded, today, profile, items, mutate]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const temp: ListItem = {
      id: `temp-${title}-${items.length}`,
      list: "shopping",
      title,
      subtitle: null,
      notes: null,
      meta: {},
      status: "open",
      position: Number.MAX_SAFE_INTEGER,
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    await mutate(
      async () => {
        await write((db) => db.from("list_items").insert({ list: "shopping", title }));
        return undefined;
      },
      { optimisticData: [...items, temp], populateCache: false, revalidate: true },
    );
  }

  async function toggle(item: ListItem) {
    const done = item.status !== "done";
    const patch = { status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null } as const;
    await mutate(
      async () => {
        await write((db) => db.from("list_items").update(patch).eq("id", item.id));
        return undefined;
      },
      {
        optimisticData: items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)),
        populateCache: false,
        revalidate: true,
      },
    );
  }

  return (
    <>
      <form className={styles.addForm} onSubmit={add}>
        <TextField
          placeholder="Add an item"
          aria-label="Add an item"
          value={draft}
          enterKeyHint="enter"
          autoCapitalize="sentences"
          onChange={(e) => setDraft(e.target.value)}
        />
        {draft.trim() && <TextButton type="submit">Add</TextButton>}
      </form>

      {loaded && items.length === 0 ? (
        <EmptyState pose="stashing" title="Nothing to buy">
          Add things as you think of them. They’ll wait here until shopping day.
        </EmptyState>
      ) : (
        <List>
          {open.map((item) => (
            <Row
              key={item.id}
              control={<Check checked={false} onToggle={() => toggle(item)} label={`Tick ${item.title}`} />}
              title={item.title}
              onClick={() => setEditing(item)}
            />
          ))}
        </List>
      )}

      {basket.length > 0 && (
        <Section title="In the basket">
          <List>
            {basket.map((item) => (
              <Row
                key={item.id}
                muted
                control={<Check checked onToggle={() => toggle(item)} label={`Untick ${item.title}`} />}
                title={item.title}
              />
            ))}
          </List>
        </Section>
      )}

      {profile && items.length > 0 && (
        <div className={styles.footnote}>
          <Note>
            Shopping day is {WEEKDAYS[profile.shopping_day]}. Ticked items clear once it’s over.
          </Note>
        </div>
      )}

      <EditItemSheet item={editing} onClose={() => setEditing(null)} onSaved={() => mutate()} />
    </>
  );
}

function EditItemSheet({
  item,
  onClose,
  onSaved,
}: {
  item: ListItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Sheet open={item !== null} onClose={onClose} title="Edit item">
      {item && <EditItemForm key={item.id} item={item} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function EditItemForm({ item, onClose, onSaved }: { item: ListItem; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(item.title);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) await write((db) => db.from("list_items").update({ title: title.trim() }).eq("id", item.id));
    onSaved();
    onClose();
  }

  async function remove() {
    await write((db) => db.from("list_items").delete().eq("id", item.id));
    onSaved();
    onClose();
  }

  return (
    <form className={styles.sheetForm} onSubmit={save}>
      <TextField value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Item" autoFocus />
      <div className={styles.sheetActions}>
        <TextButton className={styles.danger} onClick={remove}>
          Remove
        </TextButton>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
