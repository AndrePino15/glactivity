"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Check, List, Note, Row, Section, TextButton } from "@/components/ui";
import { parseExamText, type ParsedExam } from "@/lib/calendar/exams";
import { wallTimeToUtc } from "@/lib/calendar/zones";
import { refresh, write } from "@/lib/db/client";
import { useSources, useToday } from "@/lib/db/hooks";
import { formatShortDay } from "@/lib/dates";
import styles from "./exams.module.css";

const toInstant = (date: string, time: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return wallTimeToUtc({ year, month, day, hour, minute, second: 0 }, "Europe/London").toISOString();
};

/**
 * The exam timetable has no calendar link, so it's pasted in: copy the page,
 * check what was found, save. Saving replaces the previous paste.
 */
export function ExamPaste() {
  const router = useRouter();
  const today = useToday();
  const { data: sources } = useSources();
  const [text, setText] = useState("");
  const [found, setFound] = useState<ParsedExam[] | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const existing = sources.find((s) => s.kind === "exam_paste");
  const chosen = (found ?? []).filter((_, i) => !skipped.has(i));

  async function save() {
    setBusy(true);
    const source =
      existing ??
      (await write((db) =>
        db
          .from("calendar_sources")
          .insert({ name: "Exams", kind: "exam_paste", default_category: "exam" })
          .select()
          .single(),
      ));
    if (!source) return;
    await write((db) => db.from("events").delete().eq("source_id", source.id));
    await write((db) =>
      db.from("events").insert(
        chosen.map((exam) => ({
          source_id: source.id,
          title: exam.title,
          starts_at: toInstant(exam.date, exam.start),
          ends_at: toInstant(exam.date, exam.end),
          category: "exam",
          notes: exam.timeKnown ? null : "Time not found in the pasted text; check it.",
        })),
      ),
    );
    await refresh("events", "sources");
    router.push("/timetable");
  }

  if (found) {
    return (
      <>
        <Section title={found.length ? `Found ${found.length} exam${found.length === 1 ? "" : "s"}` : "No exams found"}>
          {found.length === 0 ? (
            <Note>
              Nothing with a module code (like COMP1215) and a date was found. Try copying the whole table from the exam
              timetable page.
            </Note>
          ) : (
            <List>
              {found.map((exam, i) => (
                <Row
                  key={i}
                  control={
                    <Check
                      checked={!skipped.has(i)}
                      label={`Include ${exam.title}`}
                      onToggle={() =>
                        setSkipped((s) => {
                          const next = new Set(s);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    />
                  }
                  title={exam.title}
                  detail={`${formatShortDay(exam.date)} · ${exam.timeKnown ? `${exam.start}–${exam.end}` : "time not found, set to 09:00"}`}
                />
              ))}
            </List>
          )}
        </Section>
        <div className={styles.actions}>
          <TextButton onClick={() => setFound(null)}>Back</TextButton>
          {chosen.length > 0 && (
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : `Save ${chosen.length} exam${chosen.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className={styles.form}>
      <Note>
        Open your exam timetable, select the whole table, copy it and paste it here.
        {existing ? " Saving replaces the exams you pasted before." : ""}
      </Note>
      <textarea
        className={styles.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"COMP1215  Foundations of Computer Science  12/01/2027  09:30  2 hours"}
        aria-label="Exam timetable"
        rows={10}
      />
      <div className={styles.actions}>
        <Button
          disabled={!text.trim() || !today}
          onClick={() => {
            setSkipped(new Set());
            setFound(parseExamText(text, today!));
          }}
        >
          Find exams
        </Button>
      </div>
    </div>
  );
}
