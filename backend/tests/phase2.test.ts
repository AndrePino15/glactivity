import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb } from "./db";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
let token: string;

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id) values ($1), ($2)", [ALICE, BOB]);
  token = (await db.query<{ cron_token: string }>("select cron_token from private.push_config")).rows[0].cron_token;
});

describe("workouts and meals", () => {
  it("keeps one plan entry per weekday and one meal per slot", async () => {
    await asUser(db, ALICE, async () => {
      await db.query("insert into public.workout_plan (weekday, title, kind) values (1, 'Push', 'gym')");
      await expect(
        db.query("insert into public.workout_plan (weekday, title, kind) values (1, 'Pull', 'gym')"),
      ).rejects.toThrow(/duplicate key/);
      await db.query("insert into public.meal_plan (day, slot, title) values ('2026-11-05', 'dinner', 'Pasta')");
      await expect(
        db.query("insert into public.meal_plan (day, slot, title) values ('2026-11-05', 'dinner', 'Curry')"),
      ).rejects.toThrow(/duplicate key/);
      await db.query(
        "insert into public.workout_logs (day, title, kind, status) values ('2026-11-05', 'Push', 'home', 'done')",
      );
    });
  });

  it("keeps them private", async () => {
    const seen = await asUser(db, BOB, () =>
      db.query("select (select count(*) from public.workout_plan)::int as plans, (select count(*) from public.meal_plan)::int as meals"),
    );
    expect(seen.rows[0]).toEqual({ plans: 0, meals: 0 });
  });

  it("forgets a deleted saved meal on the plan without losing the day's meal", async () => {
    await asUser(db, ALICE, async () => {
      const { rows } = await db.query<{ id: string }>(
        "insert into public.meals (name, ingredients) values ('Chilli', '{beans,rice}') returning id",
      );
      await db.query("insert into public.meal_plan (day, slot, title, meal_id) values ('2026-11-06', 'dinner', 'Chilli', $1)", [
        rows[0].id,
      ]);
      await db.query("delete from public.meals where id = $1", [rows[0].id]);
      const plan = await db.query("select title, meal_id from public.meal_plan where day = '2026-11-06'");
      expect(plan.rows).toEqual([{ title: "Chilli", meal_id: null }]);
    });
  });
});

describe("notifications", () => {
  it("hides the push config from everyone but the database", async () => {
    await expect(asUser(db, ALICE, () => db.query("select * from private.push_config"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asAnon(db, () => db.query("select * from private.push_config"))).rejects.toThrow(/permission denied/);
  });

  it("stores the first push keys and keeps them", async () => {
    await asUser(db, ALICE, async () => {
      expect((await db.query("select public.vapid_public_key() as k")).rows[0]).toEqual({ k: null });
      await db.query("select public.init_vapid('pub-1', 'priv-1')");
      await db.query("select public.init_vapid('pub-2', 'priv-2')");
      expect((await db.query("select public.vapid_public_key() as k")).rows[0]).toEqual({ k: "pub-1" });
    });
  });

  it("only gives the daily job's data to the holder of the token", async () => {
    await asUser(db, ALICE, () => db.query("insert into public.reminders (title, due_on) values ('Rent', '2026-11-08')"));
    await expect(
      asAnon(db, () => db.query("select public.push_batch($1)", ["00000000-0000-0000-0000-000000000000"])),
    ).rejects.toThrow(/invalid token/);
    await expect(asUser(db, ALICE, () => db.query("select public.push_batch($1)", [token]))).rejects.toThrow(
      /permission denied/,
    );
    const batch = await asAnon(db, () => db.query<{ b: { keys: { private: string }; reminders: { title: string }[] } }>(
      "select public.push_batch($1) as b",
      [token],
    ));
    expect(batch.rows[0].b.keys.private).toBe("priv-1");
    expect(batch.rows[0].b.reminders.map((r) => r.title)).toEqual(["Rent"]);
  });

  it("lets signed-out visitors call nothing else", async () => {
    await expect(asAnon(db, () => db.query("select public.vapid_public_key()"))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, () => db.query("select public.my_push_keys()"))).rejects.toThrow(/permission denied/);
  });

  it("marks reminders as notified with the token", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.reminders where title = 'Rent'");
    await asAnon(db, () => db.query("select public.mark_notified($1, $2, '2026-11-05')", [token, [rows[0].id]]));
    const after = await db.query("select last_notified_on::text as d from public.reminders where id = $1", [rows[0].id]);
    expect(after.rows[0]).toEqual({ d: "2026-11-05" });
  });
});
