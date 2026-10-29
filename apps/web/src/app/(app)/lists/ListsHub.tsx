"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { refresh } from "@/lib/db/client";
import { useList, useReminders, useToday } from "@/lib/db/hooks";
import type { ListItem } from "@/lib/db/types";
import { relativeDay } from "@/lib/dates";
import { addMediaItem, addQuickReminder, addShoppingItem } from "@/lib/quick-add";
import { upcomingReminders } from "@/lib/reminders";
import styles from "./hub.module.css";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function mediaSummary(items: ListItem[], now: string, queued: string): string {
  const active = items.find((i) => i.status === "active");
  const open = items.filter((i) => i.status === "open").length;
  if (active) return `${now} ${active.title}`;
  return open ? `${open} ${queued}` : "Nothing yet";
}

/**
 * Every list on one screen, each with its own add box, so capturing a thought
 * is one line of typing. Tapping a name opens the full list.
 */
export function ListsHub() {
  const today = useToday();
  const shopping = useList("shopping");
  const reminders = useReminders();
  const movies = useList("movies");
  const books = useList("books");
  const albums = useList("albums");

  const toBuy = shopping.data.filter((i) => i.status === "open").length;
  const next = today ? upcomingReminders(reminders.data, today, 3650)[0] : undefined;

  return (
    <ul className={styles.hub}>
      <QuickAdd
        href="/lists/shopping"
        name="Shopping"
        summary={toBuy ? plural(toBuy, "item") : "Nothing to buy"}
        placeholder="Add an item"
        onAdd={async (text) => {
          await addShoppingItem(text);
          await refresh("items:shopping");
        }}
      />
      <QuickAdd
        href="/lists/reminders"
        name="Reminders"
        summary={next && today ? `${next.reminder.title}, ${next.days < 0 ? "overdue" : relativeDay(today, next.due)}` : "Nothing coming up"}
        placeholder="Rent the 1st every month"
        onAdd={async (text) => {
          if (!today) return;
          await addQuickReminder(text, today);
          await refresh("reminders");
        }}
      />
      <QuickAdd
        href="/lists/watch"
        name="Watch"
        summary={mediaSummary(movies.data, "Watching", "to watch")}
        placeholder="Add a film or show"
        onAdd={async (text) => {
          await addMediaItem("movies", text);
          await refresh("items:movies");
        }}
      />
      <QuickAdd
        href="/lists/read"
        name="Read"
        summary={mediaSummary(books.data, "Reading", "to read")}
        placeholder="Add a book"
        onAdd={async (text) => {
          await addMediaItem("books", text);
          await refresh("items:books");
        }}
      />
      <QuickAdd
        href="/lists/listen"
        name="Listen"
        summary={mediaSummary(albums.data, "This week:", "up next")}
        placeholder="Add an album"
        onAdd={async (text) => {
          await addMediaItem("albums", text);
          await refresh("items:albums");
        }}
      />
    </ul>
  );
}

function QuickAdd({
  href,
  name,
  summary,
  placeholder,
  onAdd,
}: {
  href: string;
  name: string;
  summary: string;
  placeholder: string;
  onAdd: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setText("");
    try {
      await onAdd(value);
    } catch {
      setText(value); // keep what was typed so nothing is lost
    }
    setBusy(false);
  }

  return (
    <li className={styles.item}>
      <Link href={href} className={styles.name}>
        <span>
          <span className={styles.title}>{name}</span>
          <span className={styles.summary}>{summary}</span>
        </span>
        <ChevronRight size={18} strokeWidth={1.8} className={styles.chevron} aria-hidden />
      </Link>
      <form onSubmit={submit} className={styles.form}>
        <input
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={`Add to ${name}`}
          enterKeyHint="done"
          autoCapitalize="sentences"
          disabled={busy}
        />
      </form>
    </li>
  );
}
