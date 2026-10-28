import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./db";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let db: PGlite;

const count = async (sql: string, params?: unknown[]) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) t`, params)).rows[0].n;

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id) values ($1), ($2)", [ALICE, BOB]);
});

describe("new users", () => {
  it("get a profile and the starter daily games", async () => {
    expect(await count("select 1 from public.profiles")).toBe(2);
    expect(await count("select 1 from public.games where user_id = $1", [ALICE])).toBe(8);
  });
});

describe("phase 1 migration", () => {
  it("backfills accounts created before the schema existed", async () => {
    const fresh = await createTestDb({ before: async (db) => {
      await db.query("insert into auth.users (id) values ($1)", [ALICE]);
    } });
    expect(await fresh.query("select 1 from public.profiles").then((r) => r.rows.length)).toBe(1);
    expect(
      await fresh.query("select 1 from public.games where user_id = $1", [ALICE]).then((r) => r.rows.length),
    ).toBe(8);
  });

  it("keeps the elevated game-seeding function out of users' reach", async () => {
    await expect(
      asUser(db, BOB, () => db.query("select public.seed_default_games($1)", [ALICE])),
    ).rejects.toThrow(/permission denied/);
  });

  it("no longer has a holidays table", async () => {
    expect(await count("select 1 from information_schema.tables where table_name = 'holidays'")).toBe(0);
  });
});

describe("row level security", () => {
  it("fills user_id automatically and keeps rows private", async () => {
    await asUser(db, ALICE, () =>
      db.query("insert into public.list_items (list, title) values ('shopping', 'Oat milk')"),
    );
    expect(await asUser(db, ALICE, () => count("select 1 from public.list_items"))).toBe(1);
    expect(await asUser(db, BOB, () => count("select 1 from public.list_items"))).toBe(0);
  });

  it("blocks writing rows for someone else", async () => {
    await expect(
      asUser(db, ALICE, () =>
        db.query("insert into public.list_items (user_id, list, title) values ($1, 'books', 'x')", [
          BOB,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("blocks changing someone else's profile", async () => {
    const result = await asUser(db, BOB, () =>
      db.query("update public.profiles set display_name = 'x' where id = $1", [ALICE]),
    );
    expect(result.affectedRows).toBe(0);
  });
});

describe("calendar sync", () => {
  it("updates a re-synced event instead of duplicating it", async () => {
    await asUser(db, ALICE, async () => {
      const { rows } = await db.query<{ id: string }>(
        "insert into public.calendar_sources (name, kind, url) values ('Soton', 'ics', 'https://example.test/feed') returning id",
      );
      const upsert = `
        insert into public.events (source_id, external_uid, title, starts_at, ends_at)
        values ($1, 'uid-1', $2, '2026-10-22 09:00Z', '2026-10-22 10:00Z')
        on conflict (source_id, external_uid, starts_at) do update set title = excluded.title`;
      await db.query(upsert, [rows[0].id, "COMP1234 Lecture"]);
      await db.query(upsert, [rows[0].id, "COMP1234 Lecture (room change)"]);
      const events = await db.query<{ title: string }>(
        "select title from public.events where source_id = $1",
        [rows[0].id],
      );
      expect(events.rows).toEqual([{ title: "COMP1234 Lecture (room change)" }]);
    });
  });

  it("allows two manual events at the same time", async () => {
    await asUser(db, ALICE, async () => {
      const insert =
        "insert into public.events (title, starts_at, ends_at) values ($1, '2026-10-23 12:00Z', '2026-10-23 13:00Z')";
      await db.query(insert, ["Lunch"]);
      await expect(db.query(insert, ["Call home"])).resolves.toBeDefined();
    });
  });
});

describe("advisor fixes", () => {
  it("still stamps updated_at with the pinned search path", async () => {
    await asUser(db, ALICE, () => db.query("update public.profiles set display_name = 'André' where id = $1", [ALICE]));
    const { rows } = await db.query<{ fresh: boolean }>(
      "select updated_at > created_at as fresh from public.profiles where id = $1",
      [ALICE],
    );
    expect(rows[0].fresh).toBe(true);
  });
});

describe("album of the week", () => {
  it("only accepts weeks starting on a Monday", async () => {
    await asUser(db, ALICE, async () => {
      await expect(
        db.query("insert into public.album_picks (week_start, title) values ('2026-10-21', 'x')"),
      ).rejects.toThrow();
      await expect(
        db.query(
          "insert into public.album_picks (week_start, title) values ('2026-10-19', 'In Rainbows')",
        ),
      ).resolves.toBeDefined();
    });
  });
});
