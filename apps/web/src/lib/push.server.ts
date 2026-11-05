import "server-only";
import webpush from "web-push";
import type { Payload, Subscription } from "./push-job";

/**
 * Push services want a way to reach whoever runs the app: an https: or mailto:
 * address. The site's own https address is used; anything else (like a local
 * http address) falls back to the project's page.
 */
export function pushContact(origin: string): string {
  return origin.startsWith("https://") ? origin : "https://github.com/AndrePino15/glactivity";
}

/** Sends one notification; returns the push service's HTTP status (410 = device gone). */
export async function sendPush(
  subscription: Pick<Subscription, "endpoint" | "p256dh" | "auth">,
  payload: Payload,
  keys: { public: string; private: string },
  contact: string,
): Promise<number> {
  try {
    const result = await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { vapidDetails: { subject: pushContact(contact), publicKey: keys.public, privateKey: keys.private }, TTL: 12 * 60 * 60 },
    );
    return result.statusCode;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? 500;
  }
}

export function generateKeys() {
  const keys = webpush.generateVAPIDKeys();
  return { public: keys.publicKey, private: keys.privateKey };
}
