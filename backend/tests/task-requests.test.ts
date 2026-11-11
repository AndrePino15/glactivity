import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb } from "./db";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
let secret: string;
let bobSecret: string;

const call = <T = unknown>(sql: string, params: unknown[] = []) =>
  asAnon(db, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0]?.r);

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id) values ($1), ($2)", [ALICE, BOB]);
  await db.query("insert into public.profiles (id) values ($1), ($2) on conflict do nothing", [ALICE, BOB]);
  secret = (await asUser(db, ALICE, () => db.query<{ t: string }>("select public.agent_link_token() as t"))).rows[0].t;
  bobSecret = (await asUser(db, BOB, () => db.query<{ t: string }>("select public.agent_link_token() as t"))).rows[0].t;
});

const ask = (body: string) =>
  asUser(db, ALICE, async () =>
    (await db.query<{ id: string }>("insert into public.agent_notes (kind, body, status, topic) values ('inbox', $1, 'new', 'task') returning id", [body])).rows[0].id,
  );

describe("tasks described in your own words", () => {
  it("only inbox notes can be about a task", async () => {
    await expect(
      asUser(db, ALICE, () => db.query("insert into public.agent_notes (kind, body, topic) values ('learned', 'x', 'task')")),
    ).rejects.toThrow(/agent_notes_topic_inbox/);
  });

  it("shows the assistant which new notes are task requests", async () => {
    const id = await ask("Physics lab report, about 3 hours, due next Wednesday. Also read chapter 5 before Thursday.");
    const ctx = await call<{ memory: { new_from_owner: { id: string; topic: string }[] } }>("public.agent_context($1)", [secret]);
    expect(ctx.memory.new_from_owner).toMatchObject([{ id, topic: "task" }]);
  });

  it("turns one note into several tasks and files the note", async () => {
    const id = (await call<{ memory: { new_from_owner: { id: string }[] } }>("public.agent_context($1)", [secret])).memory.new_from_owner[0].id;
    const result = await call<{ task_ids: string[] }>("public.agent_set_up_tasks($1, $2, $3)", [
      secret,
      id,
      JSON.stringify([
        { title: "Physics lab report", due_on: "2026-11-18", estimate_minutes: 180, subject: "PHYS1001" },
        { title: "Read chapter 5", due_on: "2026-11-19", estimate_minutes: 60, notes: "Estimated: about an hour" },
      ]),
    ]);
    expect(result.task_ids).toHaveLength(2);
    await asUser(db, ALICE, async () => {
      const tasks = await db.query("select title, estimate_minutes, source from public.tasks order by due_on");
      expect(tasks.rows).toEqual([
        { title: "Physics lab report", estimate_minutes: 180, source: "claude" },
        { title: "Read chapter 5", estimate_minutes: 60, source: "claude" },
      ]);
      expect((await db.query("select status from public.agent_notes where id = $1", [id])).rows).toEqual([{ status: "used" }]);
      const log = await db.query<{ summary: string }>("select summary from public.agent_activity where summary like 'Set up%'");
      expect(log.rows[0].summary).toBe("Set up Physics lab report; Read chapter 5 from your note");
    });
    await expect(call("public.agent_set_up_tasks($1, $2, $3)", [secret, id, JSON.stringify([{ title: "Again" }])])).rejects.toThrow(
      /already been set up/,
    );
  });

  it("checks each task and changes nothing if one is wrong", async () => {
    const id = await ask("Essay");
    await expect(
      call("public.agent_set_up_tasks($1, $2, $3)", [secret, id, JSON.stringify([{ title: "Essay", priority: 1 }, { estimate_minutes: 60 }])]),
    ).rejects.toThrow(/add_task needs: title/);
    const count = await asUser(db, ALICE, () => db.query("select count(*)::int as n from public.tasks where title = 'Essay'"));
    expect(count.rows).toEqual([{ n: 0 }]);
  });

  it("only works on the owner's own notes", async () => {
    const id = await ask("Dissertation proposal");
    await expect(call("public.agent_set_up_tasks($1, $2, $3)", [bobSecret, id, JSON.stringify([{ title: "x" }])])).rejects.toThrow(/no such note/);
    await expect(asUser(db, ALICE, () => db.query("select public.agent_set_up_tasks($1, $2, '[]')", [secret, id]))).rejects.toThrow(
      /permission denied/,
    );
  });
});
