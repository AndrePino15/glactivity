import type { ISODate } from "./dates";
import type { Reminder } from "./db/types";
import { remindersToNotify } from "./notify";

export type Subscription = { user_id: string; endpoint: string; p256dh: string; auth: string };
export type Batch = {
  keys: { public: string | null; private: string | null };
  reminders: (Reminder & { user_id: string })[];
  subscriptions: Subscription[];
};
export type Payload = { title: string; body: string; url: string };

export type JobDeps = {
  /** Sends one push; resolves to the push service's HTTP status. */
  send: (subscription: Subscription, payload: Payload, keys: { public: string; private: string }) => Promise<number>;
  markNotified: (reminderIds: string[], day: ISODate) => Promise<void>;
  forget: (endpoint: string) => Promise<void>;
};

/**
 * The daily reminder run: works out what to announce, sends it to each of the
 * owner's devices, forgets devices that are gone, and records what was sent.
 */
export async function runReminderJob(batch: Batch, today: ISODate, deps: JobDeps) {
  const keys = batch.keys;
  if (!keys.public || !keys.private) return { sent: 0, reminders: 0, reason: "no keys yet" };

  const notices = remindersToNotify(batch.reminders, today);
  const sentFor: string[] = [];
  const gone = new Set<string>();
  let sent = 0;

  for (const notice of notices) {
    const owner = (notice.reminder as Reminder & { user_id: string }).user_id;
    const devices = batch.subscriptions.filter((s) => s.user_id === owner && !gone.has(s.endpoint));
    let delivered = false;
    for (const device of devices) {
      const status = await deps.send(
        device,
        { title: notice.title, body: notice.body, url: "/lists/reminders" },
        { public: keys.public, private: keys.private },
      );
      if (status === 404 || status === 410) {
        gone.add(device.endpoint);
        await deps.forget(device.endpoint);
      } else if (status >= 200 && status < 300) {
        delivered = true;
        sent++;
      }
    }
    if (delivered) sentFor.push(notice.reminder.id);
  }

  if (sentFor.length) await deps.markNotified(sentFor, today);
  return { sent, reminders: sentFor.length, reason: null };
}
