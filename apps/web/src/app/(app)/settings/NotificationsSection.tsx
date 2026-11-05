"use client";

import { useEffect, useState } from "react";
import { Button, Note, TextButton } from "@/components/ui";
import { write } from "@/lib/db/client";
import styles from "./settings.module.css";

type State =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "install-first" }
  | { kind: "blocked" }
  | { kind: "off" }
  | { kind: "on"; subscription: PushSubscription };

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function base64UrlToBytes(base64Url: string) {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function currentState(): Promise<State> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIOS() && !isInstalled() ? { kind: "install-first" } : { kind: "unsupported" };
  }
  if (Notification.permission === "denied") return { kind: "blocked" };
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? { kind: "on", subscription } : { kind: "off" };
}

/** Turn reminder notifications on or off for this device. */
export function NotificationsSection() {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    currentState().then(setState, () => setState({ kind: "unsupported" }));
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setState({ kind: "blocked" });
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const response = await fetch("/api/push/keys", { method: "POST" });
      const { publicKey } = (await response.json()) as { publicKey?: string };
      if (!publicKey) throw new Error("Couldn’t set up notifications");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
      const json = subscription.toJSON();
      await write((db) =>
        db
          .from("push_subscriptions")
          .upsert(
            { endpoint: subscription.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
            { onConflict: "endpoint" },
          ),
      );
      setState({ kind: "on", subscription });
      await sendTest();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t turn notifications on");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(subscription: PushSubscription) {
    setBusy(true);
    await write((db) => db.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint));
    await subscription.unsubscribe();
    setState({ kind: "off" });
    setMessage(null);
    setBusy(false);
  }

  async function sendTest() {
    const response = await fetch("/api/push/test", { method: "POST" });
    const { sent } = (await response.json()) as { sent?: number };
    setMessage(sent ? "Test sent. It should arrive in a few seconds." : "Couldn’t reach this device.");
  }

  return (
    <div className={styles.stack}>
      {state.kind === "checking" && <Note>Checking this device…</Note>}
      {state.kind === "install-first" && (
        <Note>
          On iPhone, notifications work once Glactivity is on your Home Screen: in Safari tap Share, then Add to Home
          Screen, and open it from there.
        </Note>
      )}
      {state.kind === "unsupported" && <Note>This browser can’t show notifications from Glactivity.</Note>}
      {state.kind === "blocked" && (
        <Note>Notifications are blocked for Glactivity. Allow them in your device’s settings, then come back here.</Note>
      )}
      {state.kind === "off" && (
        <>
          <Note>Get a notification when a reminder like rent is coming up, and on the day.</Note>
          <div>
            <Button onClick={turnOn} disabled={busy}>
              {busy ? "Turning on…" : "Turn on for this device"}
            </Button>
          </div>
        </>
      )}
      {state.kind === "on" && (
        <>
          <Note>On for this device. Reminders arrive in the morning, ahead of time and on the day.</Note>
          <div className={styles.actions}>
            <TextButton onClick={sendTest}>Send a test</TextButton>
            <TextButton className={styles.danger} onClick={() => turnOff(state.subscription)} disabled={busy}>
              Turn off
            </TextButton>
          </div>
        </>
      )}
      {message && <Note>{message}</Note>}
    </div>
  );
}
