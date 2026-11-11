import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb } from "./db";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
let secret: string;
let essay: string;

const call = <T = unknown>(sql: string, params: unknown[] = []) =>
  asAnon(db, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0]?.r);

/** An ISO time n days from now at a given UTC hour. */
const at = (days: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
};

const setMode = (mode: string) => asUser(db, ALICE, () => db.query("update public.profiles set autonomy = $1", [mode]));
const blocks = () =>
  asUser(db, ALICE, async () =>
    (await db.query<{ id: string; status: string; source: string }>("select id, status, source from public.work_blocks order by starts_at")).rows,
  );

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id) values ($1), ($2)", [ALICE, BOB]);
  await db.query("insert into public.profiles (id) values ($1), ($2) on conflict do nothing", [ALICE, BOB]);
  secret = (await asUser(db, ALICE, () => db.query<{ t: string }>("select public.agent_link_token() as t"))).rows[0].t;
});

describe("tasks", () => {
  it("defaults to Plan mode", async () => {
    const mode = await asUser(db, ALICE, () => db.query("select autonomy from public.profiles"));
    expect(mode.rows).toEqual([{ autonomy: "plan" }]);
  });

  it("adds tasks from a chat and keeps them private", async () => {
    essay = (
      await call<{ id: string }>("public.agent_add_task($1, 'History essay', current_date + 5, null, 300, 1, 'HIST2001')", [secret])
    ).id;
    expect(essay).toBeTruthy();
    expect((await asUser(db, BOB, () => db.query("select * from public.tasks"))).rows).toEqual([]);
    const ctx = await call<{ autonomy: string; tasks: { title: string; estimate_minutes: number }[] }>(
      "public.agent_plan_context($1)",
      [secret],
    );
    expect(ctx.autonomy).toBe("plan");
    expect(ctx.tasks.map((t) => [t.title, t.estimate_minutes])).toEqual([["History essay", 300]]);
  });

  it("won't let a block point at someone else's task", async () => {
    await expect(
      asUser(db, BOB, () =>
        db.query("insert into public.work_blocks (task_id, starts_at, ends_at) values ($1, now() + interval '1 day', now() + interval '1 day 1 hour')", [essay]),
      ),
    ).rejects.toThrow(/no such task/);
  });
});

describe("placing study blocks", () => {
  it("pencils blocks in as tentative in Plan mode", async () => {
    const result = await call<{ created_as: string; ids: string[] }>("public.agent_plan_blocks($1, $2)", [
      secret,
      JSON.stringify([{ task_id: essay, starts_at: at(1, 9), ends_at: at(1, 11) }]),
    ]);
    expect(result.created_as).toBe("tentative blocks");
    expect(await blocks()).toMatchObject([{ status: "tentative", source: "claude" }]);
  });

  it("refuses clashes with events, other blocks, the past and odd lengths, and says why", async () => {
    await asUser(db, ALICE, () =>
      db.query("insert into public.events (title, starts_at, ends_at, category) values ('Lecture', $1, $2, 'lecture')", [at(2, 10), at(2, 11)]),
    );
    const plan = (list: object[]) => call("public.agent_plan_blocks($1, $2)", [secret, JSON.stringify(list)]);
    await expect(plan([{ task_id: essay, starts_at: at(2, 9), ends_at: at(2, 10, 30) }])).rejects.toThrow(/clashes with Lecture/);
    await expect(plan([{ task_id: essay, starts_at: at(1, 10), ends_at: at(1, 12) }])).rejects.toThrow(/clashes with study block/);
    await expect(
      plan([
        { task_id: essay, starts_at: at(3, 9), ends_at: at(3, 11) },
        { task_id: essay, starts_at: at(3, 10), ends_at: at(3, 12) },
      ]),
    ).rejects.toThrow(/clashes with (study block|another block in this list)/);
    await expect(plan([{ task_id: essay, starts_at: at(-1, 9), ends_at: at(-1, 10) }])).rejects.toThrow(/in the past/);
    await expect(plan([{ task_id: essay, starts_at: at(3, 9), ends_at: at(3, 14) }])).rejects.toThrow(/15 minutes to 4 hours/);
    expect(await blocks()).toHaveLength(1); // nothing half-done
  });

  it("only suggests in Suggest mode, and accepting books the block", async () => {
    await setMode("suggest");
    const result = await call<{ created_as: string; ids: string[] }>("public.agent_plan_blocks($1, $2)", [
      secret,
      JSON.stringify([{ task_id: essay, starts_at: at(3, 14), ends_at: at(3, 16), note: "Outline first" }]),
    ]);
    expect(result.created_as).toBe("suggestions");
    expect(await blocks()).toHaveLength(1);
    await asUser(db, ALICE, async () => {
      const s = (await db.query<{ title: string; detail: string }>("select title, detail from public.agent_suggestions where id = $1", [result.ids[0]])).rows[0];
      expect(s.title).toBe("Study: History essay");
      expect(s.detail).toMatch(/Outline first/);
      await db.query("select public.accept_agent_suggestion($1)", [result.ids[0]]);
    });
    expect((await blocks()).map((b) => b.status)).toEqual(["tentative", "planned"]);
  });

  it("books directly on Autopilot, and can take back only its own future blocks", async () => {
    await setMode("autopilot");
    const { ids } = await call<{ ids: string[] }>("public.agent_plan_blocks($1, $2)", [
      secret,
      JSON.stringify([{ task_id: essay, starts_at: at(4, 9), ends_at: at(4, 10) }]),
    ]);
    const all = await blocks();
    expect(all.find((b) => b.id === ids[0])?.status).toBe("planned");
    const own = await asUser(db, ALICE, async () =>
      (await db.query<{ id: string }>("insert into public.work_blocks (task_id, starts_at, ends_at) values ($1, $2, $3) returning id", [essay, at(5, 9), at(5, 10)])).rows[0].id,
    );
    const result = await call<{ withdrawn: number }>("public.agent_withdraw_blocks($1, $2)", [secret, [ids[0], own]]);
    expect(result.withdrawn).toBe(1);
    expect((await blocks()).find((b) => b.id === own)?.status).toBe("planned");
    await setMode("plan");
  });

  it("closing a task takes back its future blocks", async () => {
    await call("public.agent_update_task($1, $2, status => 'done')", [secret, essay]);
    const left = (await blocks()).filter((b) => b.status === "planned" || b.status === "tentative");
    expect(left).toEqual([]);
    await expect(call("public.agent_plan_blocks($1, $2)", [secret, JSON.stringify([{ task_id: essay, starts_at: at(6, 9), ends_at: at(6, 10) }])])).rejects.toThrow(
      /no open task/,
    );
  });
});

describe("suggested tasks", () => {
  it("checks and accepts a proposed task", async () => {
    await expect(
      call("public.agent_add_suggestions($1, current_date, $2)", [secret, JSON.stringify([{ title: "x", change: { type: "add_task" } }])]),
    ).rejects.toThrow(/add_task needs: title/);
    const { ids } = await call<{ ids: string[] }>("public.agent_add_suggestions($1, current_date, $2)", [
      secret,
      JSON.stringify([{ title: "Add the lab report?", change: { type: "add_task", title: "Lab report", due_on: "2026-12-01", estimate_minutes: 240 } }]),
    ]);
    await asUser(db, ALICE, async () => {
      await db.query("select public.accept_agent_suggestion($1)", [ids[0]]);
      const t = await db.query("select title, estimate_minutes, source from public.tasks where title = 'Lab report'");
      expect(t.rows).toEqual([{ title: "Lab report", estimate_minutes: 240, source: "claude" }]);
    });
  });

  it("keeps the new connector functions away from signed-in users", async () => {
    await expect(asUser(db, ALICE, () => db.query("select public.agent_plan_context($1)", [secret]))).rejects.toThrow(/permission denied/);
    await expect(call("public.agent_plan_context($1)", ["0".repeat(64)])).rejects.toThrow(/invalid token/);
  });
});
