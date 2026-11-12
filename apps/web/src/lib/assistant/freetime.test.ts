import { describe, expect, it, vi } from "vitest";
import { freeTime, zonedInstant } from "./freetime";
import { handleMessage } from "./mcp";

const TZ = "Europe/London";
const local = (day: string, hhmm: string) => new Date(zonedInstant(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ)).toISOString();

describe("free time for study", () => {
  it("turns UK wall-clock times into instants, summer and winter", () => {
    expect(local("2026-07-01", "09:00")).toBe("2026-07-01T08:00:00.000Z");
    expect(local("2026-12-01", "09:00")).toBe("2026-12-01T09:00:00.000Z");
  });

  it("leaves out lectures (with a buffer), meals, training and existing blocks", () => {
    // Tuesday 17 Nov 2026.
    const [day] = freeTime({
      days: ["2026-11-17"],
      timeZone: TZ,
      now: new Date("2026-11-16T20:00:00Z"),
      events: [{ title: "Lecture", starts_at: local("2026-11-17", "10:00"), ends_at: local("2026-11-17", "11:00"), all_day: false }],
      blocks: [
        { starts_at: local("2026-11-17", "14:00"), ends_at: local("2026-11-17", "15:00"), status: "tentative" },
        { starts_at: local("2026-11-17", "16:00"), ends_at: local("2026-11-17", "17:00"), status: "skipped" },
      ],
      training: [{ weekday_number: 2, kind: "gym", preferred_time: "17:30:00", title: "Push" }],
    });
    expect(day.free.map((f) => f.local)).toEqual([
      "Tue 17 Nov 08:30–09:50",
      "Tue 17 Nov 11:10–12:30",
      "Tue 17 Nov 13:30–14:00",
      "Tue 17 Nov 15:10–17:20",
      "Tue 17 Nov 20:00–21:30",
    ]);
    expect(day.already_planned_minutes).toBe(60);
    expect(day.room_minutes).toBe(240);
    expect(day.training).toBe("Push around 17:30");
  });

  it("starts from now, and keeps weekends short", () => {
    const [saturday] = freeTime({
      days: ["2026-11-21"],
      timeZone: TZ,
      now: new Date("2026-11-21T15:05:00Z"),
      events: [{ title: "Trip to Bath", starts_at: "2026-11-21T00:00:00Z", ends_at: "2026-11-22T00:00:00Z", all_day: true }],
      blocks: [],
      training: [],
    });
    expect(saturday.free.map((f) => f.local)).toEqual(["Sat 21 Nov 15:15–18:00"]);
    expect(saturday.all_day).toEqual(["Trip to Bath"]);
    expect(saturday.room_minutes).toBe(165);
  });
});

describe("planning tools", () => {
  it("merges tasks and the autonomy setting into get_context", async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === "agent_plan_context"
        ? { autonomy: "plan", tasks: [{ title: "Essay" }], blocks: [] }
        : fn === "agent_goal_context"
          ? {
              goals: [
                {
                  title: "Imperial MSc",
                  status: "active",
                  milestones: [
                    { status: "done", target_date: "2026-11-01", tasks: [{ status: "done", estimate_minutes: 120, spent_minutes: 0 }] },
                    { status: "open", target_date: "2026-11-19", tasks: [{ status: "open", estimate_minutes: 360, spent_minutes: 60 }] },
                  ],
                },
              ],
              this_week_for_goals: null,
            }
          : { today: "2026-11-17", now: "2026-11-17T08:00:00Z", timezone: TZ, profile: null, events: [], periods: [], training_plan: [], training_log: [], meal_plan: [], media: [], rule_suggestion_feedback: [] },
    );
    const reply = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_context", arguments: {} } }, rpc);
    expect(reply?.result).toMatchObject({ structuredContent: { autonomy: "plan", tasks: [{ title: "Essay" }], today: "2026-11-17" } });
    const goal = (reply?.result as { structuredContent: { goals: { progress: object; milestones: { state: string }[] }[] } }).structuredContent.goals[0];
    // 120 done + 60 of 360 = 180 of 480; the open milestone needs 300 minutes in 2 days.
    expect(goal.progress).toEqual({ percent: 38, done_minutes: 180, total_minutes: 480 });
    expect(goal.milestones.map((m) => m.state)).toEqual(["done", "at_risk"]);
  });

  it("finds free time for the next days", async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === "agent_plan_context"
        ? { blocks: [] }
        : { today: "2026-11-17", now: "2026-11-16T20:00:00Z", timezone: TZ, events: [], training_plan: [] },
    );
    const reply = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "find_free_time", arguments: { days: 2 } } }, rpc);
    const days = (reply?.result as { structuredContent: { days: { day: string }[] } }).structuredContent.days;
    expect(days.map((d) => d.day)).toEqual(["2026-11-17", "2026-11-18"]);
  });

  it("tells Claude Glactivity is the main calendar", async () => {
    const init = await handleMessage({ jsonrpc: "2.0", id: 3, method: "initialize", params: {} }, vi.fn());
    expect((init?.result as { instructions: string }).instructions).toMatch(/main calendar/);
    const list = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/list" }, vi.fn());
    const addEvent = (list?.result as { tools: { name: string; description: string }[] }).tools.find((t) => t.name === "add_event");
    expect(addEvent?.description).toMatch(/main calendar/);
  });
});

describe("goal planning", () => {
  it("serves the planning steps for chats, drafts and re-plans", async () => {
    for (const mode of ["chat", "draft", "replan"]) {
      const reply = await handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_goal_planning_steps", arguments: { mode } } }, vi.fn());
      const steps = (reply?.result as { structuredContent: { steps: string } }).structuredContent.steps;
      expect(steps).toContain("official sources");
      expect(steps).toContain(mode === "draft" ? "questions" : mode === "replan" ? "dropped" : "once I agree");
    }
  });

  it("offers a Plan a goal prompt", async () => {
    const list = await handleMessage({ jsonrpc: "2.0", id: 6, method: "prompts/list" }, vi.fn());
    expect((list?.result as { prompts: { name: string }[] }).prompts.map((p) => p.name)).toContain("plan_a_goal");
    const prompt = await handleMessage(
      { jsonrpc: "2.0", id: 7, method: "prompts/get", params: { name: "plan_a_goal", arguments: { goal: "Imperial MSc in AI" } } },
      vi.fn(),
    );
    expect((prompt?.result as { messages: { content: { text: string } }[] }).messages[0].content.text).toMatch(/Imperial MSc in AI[\s\S]*Schedule backwards/);
  });

  it("saves a plan in one call and turns update_goal into the same call", async () => {
    const rpc = vi.fn(async () => ({ goal_id: "g" }));
    await handleMessage({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "update_goal", arguments: { id: "g", status: "paused" } } }, rpc);
    expect(rpc).toHaveBeenCalledWith("agent_save_goal_plan", { plan: { goal: { id: "g", status: "paused" } } });
  });

  it("adds the weekly review to Sunday evening checks only", async () => {
    const steps = async (slot: string) =>
      ((await handleMessage({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "get_run_steps", arguments: { slot } } }, vi.fn()))?.result as {
        structuredContent: { steps: string };
      }).structuredContent.steps;
    expect(await steps("evening")).toContain("Sundays only");
    expect(await steps("morning")).not.toContain("Sundays only");
  });
});
