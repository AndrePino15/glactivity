import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb } from "./db";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
let secret: string;
let bobSecret: string;
let goalId: string;
let milestoneIds: string[];
let taskIds: string[];

const call = <T = unknown>(sql: string, params: unknown[] = []) =>
  asAnon(db, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0]?.r);
const save = <T = Record<string, unknown>>(plan: object, who = secret) =>
  call<T>("public.agent_save_goal_plan($1, $2)", [who, JSON.stringify(plan)]);
const at = (days: number, hour: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id) values ($1), ($2)", [ALICE, BOB]);
  await db.query("insert into public.profiles (id) values ($1), ($2) on conflict do nothing", [ALICE, BOB]);
  secret = (await asUser(db, ALICE, () => db.query<{ t: string }>("select public.agent_link_token() as t"))).rows[0].t;
  bobSecret = (await asUser(db, BOB, () => db.query<{ t: string }>("select public.agent_link_token() as t"))).rows[0].t;
});

describe("drafting a goal from a note", () => {
  it("files a goal note and saves a draft plan with questions and sources in one go", async () => {
    const noteId = await asUser(db, ALICE, async () =>
      (
        await db.query<{ id: string }>(
          "insert into public.agent_notes (kind, body, status, topic) values ('inbox', 'Apply to Imperial for an MSc in AI, starting next September', 'new', 'goal') returning id",
        )
      ).rows[0].id,
    );
    const result = await save<{ goal_id: string; status: string; milestone_ids: string[]; task_ids: string[] }>({
      from_note_id: noteId,
      goal: { title: "Imperial MSc in AI", why: "Move into machine learning", target_date: "2027-09-30" },
      milestones: [
        { title: "Shortlist programmes", target_date: "2026-12-01", tasks: [{ title: "Compare 3 programmes", estimate_minutes: 180 }] },
        {
          title: "Submit application",
          target_date: "2027-01-15",
          date_source_url: "https://www.imperial.ac.uk/study/apply/postgraduate-taught/",
          tasks: [
            { title: "Draft personal statement", estimate_minutes: 360 },
            { title: "Ask two referees", estimate_minutes: 60 },
          ],
        },
      ],
      sources: [{ title: "Imperial: how to apply", url: "https://www.imperial.ac.uk/study/apply/postgraduate-taught/", note: "Rounds close in January" }],
      questions: ["Which programme: AI, or Computing (AI and ML)?", "Who could your referees be?"],
    });
    expect(result.status).toBe("draft");
    expect(result.milestone_ids).toHaveLength(2);
    expect(result.task_ids).toHaveLength(3);
    ({ goal_id: goalId, milestone_ids: milestoneIds, task_ids: taskIds } = result);

    await asUser(db, ALICE, async () => {
      expect((await db.query("select status from public.agent_notes where id = $1", [noteId])).rows).toEqual([{ status: "used" }]);
      const milestones = await db.query("select title, position, date_confirmed from public.milestones order by position");
      expect(milestones.rows).toEqual([
        { title: "Shortlist programmes", position: 0, date_confirmed: true },
        { title: "Submit application", position: 1, date_confirmed: false }, // from an outside source: to confirm
      ]);
      const notes = await db.query<{ kind: string }>("select kind from public.goal_notes order by created_at, kind");
      expect(notes.rows.map((n) => n.kind).sort()).toEqual(["question", "question", "source"]);
      const subjects = await db.query("select distinct subject from public.tasks");
      expect(subjects.rows).toEqual([{ subject: "Imperial MSc in AI" }]);
    });
  });

  it("won't plan study time for a draft goal", async () => {
    await expect(
      asUser(db, ALICE, () =>
        db.query("insert into public.work_blocks (task_id, starts_at, ends_at) values ($1, $2, $3)", [taskIds[0], at(1, 9), at(1, 10)]),
      ),
    ).rejects.toThrow(/goal that is draft/);
  });

  it("shows the assistant the goal, its milestones, tasks and questions", async () => {
    const ctx = await call<{ goals: { title: string; status: string; milestones: { tasks: unknown[] }[]; notes: unknown[] }[] }>(
      "public.agent_goal_context($1)",
      [secret],
    );
    expect(ctx.goals).toHaveLength(1);
    expect(ctx.goals[0]).toMatchObject({ title: "Imperial MSc in AI", status: "draft" });
    expect(ctx.goals[0].milestones.map((m) => m.tasks.length)).toEqual([1, 2]);
    expect(ctx.goals[0].notes).toHaveLength(3);
  });
});

describe("refining and working on a goal", () => {
  it("takes answers, resolves questions and refines the plan without losing anything", async () => {
    const ids = await asUser(db, ALICE, async () => {
      const q = (await db.query<{ id: string }>("select id from public.goal_notes where kind = 'question' order by body limit 1")).rows[0].id;
      const a = (
        await db.query<{ id: string }>(
          "insert into public.goal_notes (goal_id, kind, body) values ($1, 'answer', 'The AI MSc. Referees: Dr Patel and my placement manager') returning id",
          [goalId],
        )
      ).rows[0].id;
      return { q, a };
    });
    await call("public.agent_goal_notes($1, $2, resolve_ids => $3)", [secret, goalId, [ids.q, ids.a]]);
    await save({
      goal: { id: goalId, status: "active" },
      milestones: [
        { id: milestoneIds[1], tasks: [{ id: taskIds[2], title: "Ask Dr Patel and placement manager for references" }] },
        { title: "Prepare for interview", target_date: "2027-03-01", tasks: [{ title: "Mock interview", estimate_minutes: 90 }] },
      ],
    });
    await asUser(db, ALICE, async () => {
      expect((await db.query("select status from public.goals")).rows).toEqual([{ status: "active" }]);
      const milestones = await db.query("select title, position from public.milestones order by position");
      expect(milestones.rows).toEqual([
        { title: "Shortlist programmes", position: 0 },
        { title: "Submit application", position: 1 },
        { title: "Prepare for interview", position: 2 },
      ]);
      expect((await db.query("select title from public.tasks where id = $1", [taskIds[2]])).rows).toEqual([
        { title: "Ask Dr Patel and placement manager for references" },
      ]);
      const open = await db.query("select count(*)::int as n from public.goal_notes where kind in ('question', 'answer') and not resolved");
      expect(open.rows).toEqual([{ n: 1 }]);
    });
  });

  it("plans and logs time once the goal is active", async () => {
    await asUser(db, ALICE, () =>
      db.query("insert into public.work_blocks (task_id, starts_at, ends_at) values ($1, $2, $3)", [taskIds[0], at(1, 9), at(1, 10)]),
    );
    await call("public.agent_log_progress($1, $2, 90)", [secret, taskIds[1]]);
    await call("public.agent_log_progress($1, $2, done => true)", [secret, taskIds[0]]);
    const ctx = await call<{ goals: { milestones: { tasks: { title: string; status: string; spent_minutes: number }[] }[] }[] }>(
      "public.agent_goal_context($1)",
      [secret],
    );
    const tasks = ctx.goals[0].milestones.flatMap((m) => m.tasks);
    expect(tasks.find((t) => t.title === "Draft personal statement")?.spent_minutes).toBe(90);
    expect(tasks.find((t) => t.title === "Compare 3 programmes")?.status).toBe("done");
  });

  it("confirms a date and finishes a milestone", async () => {
    await call("public.agent_update_milestone($1, $2, date_confirmed => true, status => 'done')", [secret, milestoneIds[0]]);
    await asUser(db, ALICE, async () => {
      expect((await db.query("select status, date_confirmed from public.milestones where id = $1", [milestoneIds[0]])).rows).toEqual([
        { status: "done", date_confirmed: true },
      ]);
      const log = await db.query<{ summary: string }>("select summary from public.agent_activity order by at");
      expect(log.rows.map((r) => r.summary)).toEqual(
        expect.arrayContaining(["Drafted a plan for your goal: Imperial MSc in AI (2 milestones, 3 tasks)", "Milestone done: Shortlist programmes"]),
      );
    });
  });

  it("writes the weekly review as its own brief", async () => {
    await call("public.agent_set_brief($1, current_date, 'week', 'Statement draft this week; references next.')", [secret]);
    const ctx = await call<{ this_week_for_goals: { body: string } }>("public.agent_goal_context($1)", [secret]);
    expect(ctx.this_week_for_goals.body).toMatch(/Statement draft/);
  });
});

describe("keeping goals private", () => {
  it("doesn't let anyone else see or change them", async () => {
    expect((await asUser(db, BOB, () => db.query("select * from public.goals"))).rows).toEqual([]);
    await expect(save({ goal: { id: goalId, title: "Hijacked" } }, bobSecret)).rejects.toThrow(/no such goal/);
    await expect(call("public.agent_update_milestone($1, $2, title => 'x')", [bobSecret, milestoneIds[1]])).rejects.toThrow(/no such milestone/);
    await expect(
      asUser(db, BOB, () => db.query("insert into public.milestones (goal_id, title) values ($1, 'x')", [goalId])),
    ).rejects.toThrow(/no such goal/);
    await expect(asUser(db, ALICE, () => db.query("select public.agent_goal_context($1)", [secret]))).rejects.toThrow(/permission denied/);
  });

  it("only accepts web links for sources", async () => {
    await expect(save({ goal: { id: goalId }, milestones: [{ title: "x", date_source_url: "javascript:alert(1)" }] })).rejects.toThrow(
      /check constraint/,
    );
  });
});
