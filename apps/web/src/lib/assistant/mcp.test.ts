import { describe, expect, it, vi } from "vitest";
import { handleBody, handleMessage } from "./mcp";
import { ruleSuggestions, wallClock, type AgentContext } from "./rules";

const noDb = vi.fn(async () => {
  throw new Error("should not be called");
});

describe("connector protocol", () => {
  it("agrees a protocol version and says what it offers", async () => {
    const reply = await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } },
      noDb,
    );
    expect(reply?.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {}, prompts: {} },
      serverInfo: { name: "glactivity" },
    });
    const unknown = await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, noDb);
    expect((unknown?.result as { protocolVersion: string }).protocolVersion).toBe("2025-11-25");
  });

  it("doesn't answer notifications", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, noDb)).toBeNull();
    expect(await handleBody([{ jsonrpc: "2.0", method: "notifications/initialized" }], noDb)).toBeNull();
  });

  it("lists tools with read-only and destructive hints, and none that delete", async () => {
    const reply = await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, noDb);
    const tools = (reply?.result as { tools: { name: string; annotations: Record<string, boolean> }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["get_context", "write_note", "update_note", "set_brief", "add_suggestions", "add_shopping_items"]),
    );
    for (const tool of tools) {
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.name).not.toMatch(/delete|remove/);
    }
  });

  it("passes tool calls to the database with the right arguments", async () => {
    const rpc = vi.fn(async () => ({ ids: ["a"] }));
    const reply = await handleMessage(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "add_suggestions", arguments: { day: "2026-11-12", items: [{ title: "Plan dinner" }] } },
      },
      rpc,
    );
    expect(rpc).toHaveBeenCalledWith("agent_add_suggestions", { day: "2026-11-12", items: [{ title: "Plan dinner" }] });
    expect(reply?.result).toMatchObject({ isError: false, structuredContent: { ids: ["a"] } });
  });

  it("returns database errors to Claude as tool errors it can fix", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("add_event needs: starts_at, ends_at");
    });
    const reply = await handleMessage(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "add_suggestions", arguments: { day: "2026-11-12", items: [] } } },
      rpc,
    );
    expect(reply?.result).toEqual({ content: [{ type: "text", text: "add_event needs: starts_at, ends_at" }], isError: true });
  });

  it("refuses unknown tools and methods", async () => {
    expect((await handleMessage({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "drop_tables" } }, noDb))?.error?.code).toBe(-32602);
    expect((await handleMessage({ jsonrpc: "2.0", id: 7, method: "sampling/createMessage" }, noDb))?.error?.code).toBe(-32601);
    expect((await handleBody("nonsense", noDb)) as { error: { code: number } }).toMatchObject({ error: { code: -32700 } });
  });

  it("serves the check as a prompt", async () => {
    const reply = await handleMessage(
      { jsonrpc: "2.0", id: 8, method: "prompts/get", params: { name: "glactivity_check", arguments: { slot: "evening" } } },
      noDb,
    );
    const text = (reply?.result as { messages: { content: { text: string } }[] }).messages[0].content.text;
    expect(text).toContain("evening check");
    expect(text).toContain("add_suggestions");
  });
});

describe("free rules on the server", () => {
  it("reads instants as UK wall-clock time whatever the server's zone", () => {
    // 17:30 UTC in July is 18:30 in London.
    const summer = wallClock("2026-07-01T17:30:00Z", "Europe/London");
    expect([summer.getHours(), summer.getMinutes()]).toEqual([18, 30]);
    const winter = wallClock("2026-12-01T17:30:00Z", "Europe/London");
    expect([winter.getHours(), winter.getMinutes()]).toEqual([17, 30]);
  });

  it("works out today's free suggestions from the context", () => {
    const ctx: AgentContext = {
      today: "2026-11-13", // a Friday
      now: "2026-11-13T08:00:00Z",
      timezone: "Europe/London",
      profile: { current_country: "GB", shopping_day: "Saturday" },
      events: [],
      periods: [],
      training_plan: [],
      training_log: [],
      meal_plan: [],
      media: [],
      rule_suggestion_feedback: [{ day: "2026-11-13", key: "social", response: "dismissed" }],
    };
    const titles = ruleSuggestions(ctx).map((s) => s.title);
    expect(titles).toContain("Plan a few meals before shopping");
    expect(titles).toContain("Nothing planned this weekend yet");
    expect(titles).not.toContain("Free evening"); // dismissed today
  });
});
