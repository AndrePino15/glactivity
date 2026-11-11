"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, List, Note, Row, Section, Segmented, Sheet, TextButton } from "@/components/ui";
import { refresh, write } from "@/lib/db/client";
import { useAgentActivity, useAgentNotes, useProfile, useToday } from "@/lib/db/hooks";
import { formatShortDay, formatTime, relativeDay, toISODate } from "@/lib/dates";
import type { AgentNote, Autonomy } from "@/lib/db/types";
import styles from "../settings.module.css";
import own from "./assistant.module.css";

/** Connect Claude, see and edit what it remembers, and what it has done. */
export function AssistantSettings() {
  const notes = useAgentNotes();
  const profile = notes.data.find((n) => n.kind === "profile");
  const learned = notes.data.filter((n) => n.kind === "learned");
  const inbox = notes.data.filter((n) => n.kind === "inbox");

  async function remove(note: AgentNote) {
    await write((db) => db.from("agent_notes").delete().eq("id", note.id));
    await notes.mutate();
  }

  return (
    <>
      <Section title="Connect Claude">
        <ConnectorLink />
      </Section>

      <Section title="How much it does">
        <AutonomyPicker />
      </Section>

      <Section title="What it knows about you">
        <Profile note={profile ?? null} onSaved={() => notes.mutate()} onRemove={profile ? () => remove(profile) : undefined} />
      </Section>

      <Section title="What it has learned">
        {learned.length === 0 ? (
          <Note>Nothing yet. After a few checks it notes patterns here, like when you usually train.</Note>
        ) : (
          <List>
            {learned.map((n) => (
              <Row key={n.id} title={<span className={own.wrap}>{n.body}</span>} trailing={<RemoveButton label={n.body} onClick={() => remove(n)} />} />
            ))}
          </List>
        )}
      </Section>

      {inbox.length > 0 && (
        <Section title="What you told it">
          <List>
            {inbox.map((n) => (
              <Row
                key={n.id}
                title={<span className={own.wrap}>{n.body}</span>}
                detail={`${n.status === "new" ? "For its next check" : "Taken into account"} · ${formatShortDay(toISODate(new Date(n.created_at)))}`}
                trailing={<RemoveButton label={n.body} onClick={() => remove(n)} />}
              />
            ))}
          </List>
        </Section>
      )}

      <Activity />
    </>
  );
}

const AUTONOMY: { value: Autonomy; label: string; about: string }[] = [
  { value: "suggest", label: "Suggest", about: "It only suggests. Nothing changes until you accept." },
  {
    value: "plan",
    label: "Plan",
    about: "It pencils study time for your tasks into free time. You keep, move or skip each block. Everything else is a suggestion.",
  },
  {
    value: "autopilot",
    label: "Autopilot",
    about: "It books study time and adds tasks it spots, then tells you what it did. Plans with people, meals and shopping are still suggestions.",
  },
];

function AutonomyPicker() {
  const profile = useProfile();
  const value = profile.data?.autonomy ?? "plan";

  async function choose(next: Autonomy) {
    if (!profile.data) return;
    await profile.mutate(
      async () => {
        await write((db) => db.from("profiles").update({ autonomy: next }).eq("id", profile.data!.id));
        return { ...profile.data!, autonomy: next };
      },
      { optimisticData: { ...profile.data, autonomy: next }, revalidate: false },
    );
  }

  return (
    <div className={styles.stack}>
      <Segmented label="How much it does" value={value} options={AUTONOMY} onChange={choose} />
      <Note>{AUTONOMY.find((a) => a.value === value)?.about}</Note>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={own.remove} aria-label={`Forget: ${label}`} onClick={onClick}>
      <X size={16} strokeWidth={2} />
    </button>
  );
}

function ConnectorLink() {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void write((db) => db.rpc("agent_link_token")).then((token) => {
      if (typeof token === "string") setLink(`${window.location.origin}/api/mcp/${token}`);
    });
  }, []);

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function reset() {
    const token = await write((db) => db.rpc("reset_agent_link"));
    if (typeof token === "string") setLink(`${window.location.origin}/api/mcp/${token}`);
    setConfirmReset(false);
    await refresh("agent-activity");
  }

  return (
    <div className={styles.stack}>
      <Note>
        Add this link in Claude under Settings → Connectors → Add custom connector (name it Glactivity). Claude can then read
        your days, write the brief and suggest ideas. It can’t delete anything. Keep the link private: anyone with it can
        see your plans.
      </Note>
      <code className={own.link} data-testid="connector-link">
        {link ?? "…"}
      </code>
      <div className={styles.actions}>
        <TextButton onClick={copy} disabled={!link}>
          {copied ? "Copied" : "Copy link"}
        </TextButton>
        {confirmReset ? (
          <>
            <TextButton className={styles.danger} onClick={reset}>
              Yes, make a new link
            </TextButton>
            <TextButton onClick={() => setConfirmReset(false)}>Cancel</TextButton>
          </>
        ) : (
          <TextButton onClick={() => setConfirmReset(true)}>Make a new link</TextButton>
        )}
      </div>
      {confirmReset && <Note>The old link stops working straight away. You’d add the new one in Claude again.</Note>}
    </div>
  );
}

function Profile({ note, onSaved, onRemove }: { note: AgentNote | null; onSaved: () => void; onRemove?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  async function save() {
    const body = text.trim();
    if (!body) return;
    await write((db) =>
      note
        ? db.from("agent_notes").update({ body, source: "app" }).eq("id", note.id)
        : db.from("agent_notes").insert({ kind: "profile", body }),
    );
    setEditing(false);
    onSaved();
  }

  return (
    <div className={styles.stack}>
      {note ? <p className={own.profile}>{note.body}</p> : <Note>Nothing yet. It writes a short summary here as it gets to know your routine.</Note>}
      <div className={styles.actions}>
        <TextButton
          onClick={() => {
            setText(note?.body ?? "");
            setEditing(true);
          }}
        >
          {note ? "Edit" : "Write one yourself"}
        </TextButton>
        {onRemove && (
          <TextButton className={styles.danger} onClick={onRemove}>
            Forget this
          </TextButton>
        )}
      </div>
      <Sheet open={editing} onClose={() => setEditing(false)} title="What it knows about you">
        <div className={styles.form}>
          <textarea
            className={own.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            maxLength={4000}
            aria-label="Profile"
          />
          <div className={styles.sheetActions}>
            <Note>Short is best. It reads this at the start of every check.</Note>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function Activity() {
  const today = useToday();
  const activity = useAgentActivity();
  if (!today || activity.data.length === 0) return null;
  return (
    <Section title="What it did">
      <List>
        {activity.data.map((a) => {
          const day = toISODate(new Date(a.at));
          return (
            <Row
              key={a.id}
              title={<span className={own.wrap}>{a.summary}</span>}
              detail={`${a.actor === "you" ? "You" : "Claude"} · ${day === today ? "today" : relativeDay(today, day)}, ${formatTime(a.at)}`}
            />
          );
        })}
      </List>
    </Section>
  );
}
