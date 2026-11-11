import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb } from "./db";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const URL = "https://api.anthropic.com/v1/claude_code/routines/trig_01AbCdEf/fire";
const TOKEN = "sk-ant-oat01-" + "x".repeat(40);

let db: PGlite;
const as = <T>(user: string, sql: string, params: unknown[] = []) =>
  asUser(db, user, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0]?.r);

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id) values ($1), ($2)", [ALICE, BOB]);
});

describe("Run now", () => {
  it("only accepts Anthropic's trigger address", async () => {
    await expect(as(ALICE, "public.set_run_now($1, $2)", ["https://evil.example.com/v1/claude_code/routines/x/fire", TOKEN])).rejects.toThrow(
      /check constraint/,
    );
    await expect(as(ALICE, "public.set_run_now($1, $2)", [URL, "short"])).rejects.toThrow(/check constraint/);
  });

  it("saves the trigger and reports it without the token", async () => {
    await as(ALICE, "public.set_run_now($1, $2)", [URL, TOKEN]);
    const status = await as<Record<string, unknown>>(ALICE, "public.run_now_status()");
    expect(status).toEqual({ connected: true, last_fired_at: null });
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    expect(await as(BOB, "public.run_now_status()")).toEqual({ connected: false, last_fired_at: null });
  });

  it("hands the token over at most once every two minutes", async () => {
    expect(await as(ALICE, "public.claim_run_now()")).toEqual({ fire_url: URL, token: TOKEN });
    const again = await as<{ wait_seconds: number }>(ALICE, "public.claim_run_now()");
    expect(again.wait_seconds).toBeGreaterThan(100);
    await as(ALICE, "public.release_run_now('HTTP 401')");
    expect(await as(ALICE, "public.claim_run_now()")).toEqual({ fire_url: URL, token: TOKEN });
    expect(await as(BOB, "public.claim_run_now()")).toBeNull();
  });

  it("is out of reach for signed-out visitors and the API", async () => {
    await expect(asAnon(db, () => db.query("select public.claim_run_now()"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ALICE, () => db.query("select * from private.run_now"))).rejects.toThrow(/permission denied/);
  });

  it("logs what happened and can be disconnected", async () => {
    await as(ALICE, "public.clear_run_now()");
    expect(await as(ALICE, "public.run_now_status()")).toEqual({ connected: false, last_fired_at: null });
    const log = await asUser(db, ALICE, () => db.query<{ summary: string }>("select summary from public.agent_activity order by at, summary"));
    expect(log.rows.map((r) => r.summary)).toEqual(
      expect.arrayContaining(["Connected Run now", "Started a check (Run now)", "Run now didn’t start: HTTP 401", "Disconnected Run now"]),
    );
  });
});
