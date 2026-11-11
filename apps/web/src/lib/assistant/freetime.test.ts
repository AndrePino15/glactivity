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
        : { today: "2026-11-17", now: "2026-11-17T08:00:00Z", timezone: TZ, profile: null, events: [], periods: [], training_plan: [], training_log: [], meal_plan: [], media: [], rule_suggestion_feedback: [] },
    );
    const reply = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_context", arguments: {} } }, rpc);
    expect(reply?.result).toMatchObject({ structuredContent: { autonomy: "plan", tasks: [{ title: "Essay" }], today: "2026-11-17" } });
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
