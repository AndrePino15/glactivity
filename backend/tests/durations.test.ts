import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb } from "./db";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
let secret: string;
let essay: string;
const blockIds: Record<string, string> = {};

const call = <T = unknown>(sql: string, params: unknown[] = []) =>
  asAnon(db, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0]?.r);
const asAlice = <T>(sql: string, params: unknown[] = []) => asUser(db, ALICE, async () => (await db.query<T>(sql, params)).rows);
/** An ISO time n hours from now. */
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id) values ($1), ($2)", [ALICE, BOB]);
  await db.query("insert into public.profiles (id) values ($1), ($2) on conflict do nothing", [ALICE, BOB]);
  secret = (await asUser(db, ALICE, () => db.query<{ t: string }>("select public.agent_link_token() as t"))).rows[0].t;
  essay = (await asAlice<{ id: string }>("insert into public.tasks (title, subject, estimate_minutes) values ('Essay', 'HIST', 180) returning id"))[0].id;
  for (const [name, from, to, status] of [
    ["morning", -50, -48, "planned"],
    ["afternoon", -30, -29, "tentative"],
    ["evening", -6, -5, "planned"],
    ["later", 20, 21, "planned"],
  ] as const) {
    blockIds[name] = (
      await asAlice<{ id: string }>("insert into public.work_blocks (task_id, starts_at, ends_at, status, source) values ($1, $2, $3, $4, 'claude') returning id", [
        essay,
        hoursFromNow(from),
        hoursFromNow(to),
        status,
      ])
    )[0].id;
  }
});

describe("answering a block with one tap", () => {
  it("keeps the first estimate when the estimate changes", async () => {
    expect(await asAlice("select estimate_minutes, first_estimate_minutes from public.tasks")).toEqual([{ estimate_minutes: 180, first_estimate_minutes: 180 }]);
  });

  it("done keeps it as time spent", async () => {
    await asAlice("select public.answer_block($1, 'done')", [blockIds.morning]);
    expect(await asAlice("select status, outcome from public.work_blocks where id = $1", [blockIds.morning])).toEqual([{ status: "planned", outcome: "done" }]);
  });

  it("needed more turns a pencilled-in block into time spent and adds to the estimate", async () => {
    await asAlice("select public.answer_block($1, 'more', 60)", [blockIds.afternoon]);
    expect(await asAlice("select status, outcome, extra_minutes from public.work_blocks where id = $1", [blockIds.afternoon])).toEqual([
      { status: "planned", outcome: "more", extra_minutes: 60 },
    ]);
    expect(await asAlice("select estimate_minutes, first_estimate_minutes from public.tasks")).toEqual([{ estimate_minutes: 240, first_estimate_minutes: 180 }]);
  });

  it("didn't do it leaves the block out of time spent", async () => {
    await asAlice("select public.answer_block($1, 'missed')", [blockIds.evening]);
    const ctx = await call<{ tasks: { spent_minutes: number }[]; blocks: { outcome: string | null }[] }>("public.agent_plan_context($1)", [secret]);
    expect(ctx.tasks[0].spent_minutes).toBe(180); // 2 h done + 1 h needed more; the missed hour doesn't count
    expect(ctx.blocks.map((b) => b.outcome)).toEqual(["done", "more", "missed", null]);
  });

  it("can't answer a block that hasn't happened, or someone else's", async () => {
    await expect(asAlice("select public.answer_block($1, 'done')", [blockIds.later])).rejects.toThrow(/hasn't finished/);
    await expect(asUser(db, BOB, () => db.query("select public.answer_block($1, 'done')", [blockIds.morning]))).rejects.toThrow(/no such block/);
    await expect(asAlice("select public.answer_block($1, 'great')", [blockIds.morning])).rejects.toThrow(/outcome must be/);
  });
});

describe("what the assistant learns from", () => {
  it("lists recent blocks with how they went and finished tasks against their first estimate", async () => {
    await call("public.agent_update_task($1, $2, status => 'done')", [secret, essay]);
    const stats = await call<{
      blocks: { outcome: string | null; minutes: number; local_hour: number }[];
      finished_tasks: { title: string; first_estimate_minutes: number; actual_minutes: number }[];
    }>("public.agent_duration_stats($1)", [secret]);
    expect(stats.blocks.map((b) => [b.outcome, b.minutes])).toEqual([
      ["done", 120],
      ["more", 60],
      ["missed", 60],
    ]);
    expect(stats.finished_tasks).toMatchObject([{ title: "Essay", first_estimate_minutes: 180, actual_minutes: 180 }]);
  });

  it("records outcomes said in a chat, and keeps them private", async () => {
    const other = (
      await asAlice<{ id: string }>("insert into public.tasks (title, estimate_minutes) values ('Reading', 60) returning id")
    )[0].id;
    const block = (
      await asAlice<{ id: string }>("insert into public.work_blocks (task_id, starts_at, ends_at) values ($1, $2, $3) returning id", [
        other,
        hoursFromNow(-3),
        hoursFromNow(-2),
      ])
    )[0].id;
    await call("public.agent_record_outcome($1, $2, 'missed')", [secret, block]);
    expect(await asAlice("select outcome from public.work_blocks where id = $1", [block])).toEqual([{ outcome: "missed" }]);
    const bobSecret = (await asUser(db, BOB, () => db.query<{ t: string }>("select public.agent_link_token() as t"))).rows[0].t;
    await expect(call("public.agent_record_outcome($1, $2, 'done')", [bobSecret, block])).rejects.toThrow(/no such block/);
    await expect(asAlice("select public.agent_duration_stats($1)", [secret])).rejects.toThrow(/permission denied/);
  });
});
