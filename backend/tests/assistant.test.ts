import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb } from "./db";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const WRONG = "0".repeat(64);

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

describe("the connector link", () => {
  it("makes one long secret per person and keeps it", async () => {
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const again = (await asUser(db, ALICE, () => db.query<{ t: string }>("select public.agent_link_token() as t"))).rows[0].t;
    expect(again).toBe(secret);
    expect(bobSecret).not.toBe(secret);
  });

  it("can't be read by signed-out visitors or through the API", async () => {
    await expect(asAnon(db, () => db.query("select public.agent_link_token()"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ALICE, () => db.query("select * from private.agent_links"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("refuses a wrong secret, and signed-in users can't call connector functions", async () => {
    await expect(call("public.agent_context($1)", [WRONG])).rejects.toThrow(/invalid token/);
    await expect(asUser(db, ALICE, () => db.query("select public.agent_context($1)", [secret]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("stops the old link working after a reset", async () => {
    const fresh = (await asUser(db, BOB, () => db.query<{ t: string }>("select public.reset_agent_link() as t"))).rows[0].t;
    await expect(call("public.agent_context($1)", [bobSecret])).rejects.toThrow(/invalid token/);
    expect(await call("public.agent_context($1) ->> 'today'", [fresh])).toBeTruthy();
    bobSecret = fresh;
  });
});

describe("reading context", () => {
  it("returns the owner's plans and nobody else's", async () => {
    await asUser(db, ALICE, async () => {
      await db.query(
        "insert into public.events (title, starts_at, ends_at, category) values ('Maths lecture', now() + interval '1 day', now() + interval '1 day 1 hour', 'lecture')",
      );
      await db.query("insert into public.list_items (list, title) values ('shopping', 'Eggs')");
    });
    await asUser(db, BOB, () =>
      db.query(
        "insert into public.events (title, starts_at, ends_at) values ('Bob only', now() + interval '1 day', now() + interval '1 day 1 hour')",
      ),
    );
    const ctx = await call<Record<string, unknown>>("public.agent_context($1, 3, 3)", [secret]);
    expect((ctx.events as { title: string }[]).map((e) => e.title)).toEqual(["Maths lecture"]);
    expect(ctx.shopping_list).toEqual(["Eggs"]);
    expect(ctx).toHaveProperty("memory.learned", []);
  });
});

describe("memory", () => {
  it("files inbox notes and keeps learned notes and one profile", async () => {
    const inbox = await asUser(db, ALICE, async () =>
      (
        await db.query<{ id: string }>(
          "insert into public.agent_notes (kind, body, status) values ('inbox', 'Dentist next Tuesday afternoon', 'new') returning id",
        )
      ).rows[0].id,
    );
    let ctx = await call<{ memory: { new_from_owner: { id: string }[] } }>("public.agent_context($1)", [secret]);
    expect(ctx.memory.new_from_owner.map((n) => n.id)).toEqual([inbox]);

    await call("public.agent_update_note($1, $2, null, 'used')", [secret, inbox]);
    await call("public.agent_write_note($1, 'learned', 'Usually trains around 18:00')", [secret]);
    await call("public.agent_set_profile($1, 'Second-year student. Focuses best in the mornings.')", [secret]);
    await call("public.agent_set_profile($1, 'Second-year student. Mornings for deep work.')", [secret]);

    ctx = await call("public.agent_context($1)", [secret]);
    const memory = (ctx as unknown as { memory: Record<string, unknown> }).memory;
    expect(memory.new_from_owner).toEqual([]);
    expect((memory.filed_from_owner as { body: string }[])[0].body).toBe("Dentist next Tuesday afternoon");
    expect((memory.learned as { body: string }[]).map((n) => n.body)).toEqual(["Usually trains around 18:00"]);
    expect(memory.profile).toBe("Second-year student. Mornings for deep work.");
  });

  it("only touches the secret owner's notes", async () => {
    const alicesNote = (
      await asUser(db, ALICE, () => db.query<{ id: string }>("select id from public.agent_notes where kind = 'learned'"))
    ).rows[0].id;
    await expect(call("public.agent_update_note($1, $2, 'hijacked')", [bobSecret, alicesNote])).rejects.toThrow(
      /no such note/,
    );
  });

  it("lets the owner read and delete what it learned, and nobody else", async () => {
    const seen = await asUser(db, BOB, () => db.query("select * from public.agent_notes"));
    expect(seen.rows).toEqual([]);
    await asUser(db, ALICE, async () => {
      await db.query("delete from public.agent_notes where kind = 'learned'");
      expect((await db.query("select * from public.agent_notes where kind = 'learned'")).rows).toEqual([]);
    });
  });

  it("rejects profile notes through write_note and empty notes", async () => {
    await expect(call("public.agent_write_note($1, 'profile', 'x')", [secret])).rejects.toThrow(/set_profile/);
    await expect(call("public.agent_write_note($1, 'learned', '  ')", [secret])).rejects.toThrow(/check constraint/);
  });
});

describe("brief and suggestions", () => {
  it("keeps one brief per day and slot", async () => {
    await call("public.agent_set_brief($1, '2026-11-12', 'morning', 'A calm day.')", [secret]);
    await call("public.agent_set_brief($1, '2026-11-12', 'morning', 'A calm day, gym at six.')", [secret]);
    const rows = await asUser(db, ALICE, () => db.query("select slot, body from public.agent_briefs"));
    expect(rows.rows).toEqual([{ slot: "morning", body: "A calm day, gym at six." }]);
  });

  it("checks proposed changes and explains what's wrong", async () => {
    await expect(
      call("public.agent_add_suggestions($1, '2026-11-12', $2)", [secret, JSON.stringify([{ title: "x", change: { type: "delete_everything" } }])]),
    ).rejects.toThrow(/change.type must be/);
    await expect(
      call("public.agent_add_suggestions($1, '2026-11-12', $2)", [secret, JSON.stringify([{ title: "Gym", change: { type: "add_event", title: "Gym" } }])]),
    ).rejects.toThrow(/add_event needs: starts_at, ends_at/);
    await expect(
      call("public.agent_add_suggestions($1, '2026-11-12', $2)", [secret, JSON.stringify([1, 2, 3, 4].map((n) => ({ title: `S${n}` })))]),
    ).rejects.toThrow(/1 to 3/);
  });

  it("proposes without changing anything, then applies a change only when the owner accepts", async () => {
    const items = [
      { title: "Stock up for the week", detail: "Pasta night on Wednesday.", change: { type: "add_shopping_items", items: ["Pasta", "eggs", "Parmesan"] } },
      { title: "Book a squash game", change: { type: "add_event", title: "Squash", starts_at: "2026-11-13T18:00:00Z", ends_at: "2026-11-13T19:00:00Z", category: "social" } },
      { title: "Call home this weekend" },
    ];
    const { ids } = await call<{ ids: string[] }>("public.agent_add_suggestions($1, '2026-11-12', $2)", [secret, JSON.stringify(items)]);
    expect(ids).toHaveLength(3);

    await asUser(db, ALICE, async () => {
      const shopping = async () =>
        (await db.query<{ title: string }>("select title from public.list_items where list = 'shopping' order by title")).rows.map((r) => r.title);
      expect(await shopping()).toEqual(["Eggs"]);

      await db.query("select public.accept_agent_suggestion($1)", [ids[0]]);
      expect(await shopping()).toEqual(["Eggs", "Parmesan", "Pasta"]); // "eggs" was already there

      await db.query("update public.agent_suggestions set status = 'dismissed', responded_at = now() where id = $1", [ids[1]]);
      expect((await db.query("select * from public.events where title = 'Squash'")).rows).toEqual([]);

      await db.query("select public.accept_agent_suggestion($1)", [ids[2]]);
      await expect(db.query("select public.accept_agent_suggestion($1)", [ids[0]])).rejects.toThrow(/already answered/);

      const statuses = await db.query("select title, status from public.agent_suggestions order by created_at, title");
      expect(statuses.rows.map((r) => (r as { status: string }).status).sort()).toEqual(["accepted", "accepted", "dismissed"]);
    });
  });

  it("won't let someone else accept the owner's suggestion", async () => {
    const { ids } = await call<{ ids: string[] }>("public.agent_add_suggestions($1, '2026-11-12', $2)", [
      secret,
      JSON.stringify([{ title: "Plan dinner", change: { type: "set_meal", day: "2026-11-12", slot: "dinner", title: "Chilli" } }]),
    ]);
    await expect(asUser(db, BOB, () => db.query("select public.accept_agent_suggestion($1)", [ids[0]]))).rejects.toThrow(
      /not found/,
    );
  });

  it("plans a meal and adds a saved meal's missing ingredients", async () => {
    await asUser(db, ALICE, async () => {
      await db.query("insert into public.meals (name, ingredients) values ('Chilli', '{beans,Eggs,rice}')");
      const id = (await db.query<{ id: string }>("select id from public.agent_suggestions where title = 'Plan dinner'")).rows[0].id;
      await db.query("select public.accept_agent_suggestion($1)", [id]);
      const plan = await db.query("select title, meal_id is not null as saved from public.meal_plan where day = '2026-11-12'");
      expect(plan.rows).toEqual([{ title: "Chilli", saved: true }]);
      const shopping = await db.query<{ title: string }>("select title from public.list_items where list = 'shopping'");
      expect(shopping.rows.map((r) => r.title).sort((a, b) => a.localeCompare(b))).toEqual(["beans", "Eggs", "Parmesan", "Pasta", "rice"]);
    });
  });
});

describe("direct writes from a chat", () => {
  it("adds shopping items once, events and reminders, and logs each", async () => {
    const result = await call<{ added: string[] }>("public.agent_add_shopping_items($1, $2)", [secret, ["Milk", "milk", "Pasta"]]);
    expect(result.added).toEqual(["Milk"]);
    await call("public.agent_add_event($1, 'Dentist', '2026-11-17T14:00:00Z', '2026-11-17T14:30:00Z')", [secret]);
    await call("public.agent_add_reminder($1, 'Pay rent', '2026-12-01', 'monthly')", [secret]);
    await expect(call("public.agent_add_reminder($1, 'Rent', '2026-12-01', 'fortnightly')", [secret])).rejects.toThrow(/recurrence/);

    await asUser(db, ALICE, async () => {
      expect((await db.query("select category from public.events where title = 'Dentist'")).rows).toEqual([{ category: "personal" }]);
      expect((await db.query("select recurrence, notify_days_before from public.reminders")).rows).toEqual([
        { recurrence: "monthly", notify_days_before: 3 },
      ]);
      const log = await db.query<{ actor: string; summary: string }>("select actor, summary from public.agent_activity order by at");
      const summaries = log.rows.map((r) => r.summary);
      expect(summaries).toContain("Added to shopping: Milk");
      expect(summaries).toContain("Added to your timetable: Dentist");
      expect(summaries).toContain("Accepted: Stock up for the week");
      expect(log.rows.find((r) => r.summary.startsWith("Accepted"))?.actor).toBe("you");
    });
  });

  it("keeps the activity log private and read-only", async () => {
    expect((await asUser(db, BOB, () => db.query("select summary from public.agent_activity"))).rows).toEqual([
      { summary: "Made a new connector link" },
    ]);
    // Supabase grants table rights broadly; row level security has no update policy, so nothing changes.
    await asUser(db, ALICE, async () => {
      await db.query("update public.agent_activity set summary = 'edited'").catch(() => undefined);
      expect((await db.query("select count(*)::int as n from public.agent_activity where summary = 'edited'")).rows).toEqual([{ n: 0 }]);
    });
  });
});
