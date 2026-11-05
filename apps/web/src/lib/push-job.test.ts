import { describe, expect, it, vi } from "vitest";
import type { Batch } from "./push-job";
import { runReminderJob } from "./push-job";

const batch = (over: Partial<Batch> = {}): Batch => ({
  keys: { public: "pub", private: "priv" },
  reminders: [
    {
      id: "rent",
      user_id: "me",
      title: "Pay rent",
      notes: null,
      due_on: "2026-12-01",
      recurrence: "monthly",
      notify_days_before: 3,
      last_done_on: null,
      last_notified_on: null,
      archived: false,
    },
  ],
  subscriptions: [
    { user_id: "me", endpoint: "https://push/phone", p256dh: "a", auth: "b" },
    { user_id: "me", endpoint: "https://push/old-laptop", p256dh: "a", auth: "b" },
    { user_id: "someone-else", endpoint: "https://push/theirs", p256dh: "a", auth: "b" },
  ],
  ...over,
});

describe("runReminderJob", () => {
  it("sends to the owner's devices, forgets dead ones and records the reminder", async () => {
    const send = vi.fn(async (s: { endpoint: string }) => (s.endpoint.endsWith("old-laptop") ? 410 : 201));
    const markNotified = vi.fn(async () => {});
    const forget = vi.fn(async () => {});
    const result = await runReminderJob(batch(), "2026-12-01", { send, markNotified, forget });

    expect(send.mock.calls.map(([s]) => s.endpoint)).toEqual(["https://push/phone", "https://push/old-laptop"]);
    expect((send.mock.calls[0] as unknown[])[1]).toEqual({ title: "Pay rent", body: "Due today", url: "/lists/reminders" });
    expect(forget).toHaveBeenCalledWith("https://push/old-laptop");
    expect(markNotified).toHaveBeenCalledWith(["rent"], "2026-12-01");
    expect(result).toEqual({ sent: 1, reminders: 1, reason: null });
  });

  it("doesn't record a reminder that reached no device, so it's tried again", async () => {
    const markNotified = vi.fn(async () => {});
    await runReminderJob(batch(), "2026-12-01", { send: async () => 500, markNotified, forget: async () => {} });
    expect(markNotified).not.toHaveBeenCalled();
  });

  it("does nothing before the push keys exist", async () => {
    const send = vi.fn(async () => 201);
    const result = await runReminderJob(batch({ keys: { public: null, private: null } }), "2026-12-01", {
      send,
      markNotified: async () => {},
      forget: async () => {},
    });
    expect(send).not.toHaveBeenCalled();
    expect(result.reason).toBe("no keys yet");
  });
});
