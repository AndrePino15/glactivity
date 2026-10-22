"use client";

import { Suspense, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import {
  getPendingEmail,
  setPendingEmail,
  subscribeToPendingEmail,
} from "@/lib/auth/pending-sign-in";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./login.module.css";

/**
 * Sign in with a one-time code rather than a magic link: on iPhone a link opens
 * in Safari, not in the home-screen app, so the session would land in the
 * wrong place. (Links still work as a fallback; see proxy.ts.)
 */
export function LoginForm() {
  const router = useRouter();
  const supabase = getSupabase();
  const pendingEmail = useSyncExternalStore(subscribeToPendingEmail, getPendingEmail, () => null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  if (!supabase) {
    return (
      <main className={styles.page}>
        <Mascot pose="standing" height={132} preload />
        <h1>Preview mode</h1>
        <p className={styles.lead}>
          Glactivity isn’t connected to its database yet, so there’s nothing to sign in to.
        </p>
        <Link href="/" className={styles.button}>
          Open Glactivity
        </Link>
      </main>
    );
  }

  async function requestCode(address: string) {
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return false;
    }
    setPendingEmail(address);
    return true;
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    await requestCode(email.trim());
  }

  async function resendCode() {
    if (pendingEmail && (await requestCode(pendingEmail))) setResent(true);
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!pendingEmail) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.verifyOtp({
      email: pendingEmail,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    setPendingEmail(null);
    router.replace("/");
    router.refresh();
  }

  function startOver() {
    setPendingEmail(null);
    setCode("");
    setError(null);
    setResent(false);
  }

  return (
    <main className={styles.page}>
      <Mascot pose="standing" height={132} preload />
      <h1>Glactivity</h1>

      <Suspense fallback={null}>
        <LinkNotice />
      </Suspense>

      {pendingEmail === null ? (
        <form className={styles.form} onSubmit={sendCode}>
          <p className={styles.lead}>Sign in with your email. We’ll send you a code.</p>
          <input
            className={styles.input}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className={styles.button} disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
          <button
            type="button"
            className={styles.link}
            disabled={!email.trim()}
            onClick={() => setPendingEmail(email.trim())}
          >
            I already have a code
          </button>
        </form>
      ) : (
        <form className={styles.form} onSubmit={verify}>
          <p className={styles.lead}>
            Enter the code sent to <strong>{pendingEmail}</strong>.
          </p>
          <input
            className={`${styles.input} ${styles.code}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            placeholder="123456"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button className={styles.button} disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <div className={styles.links}>
            <button type="button" className={styles.link} onClick={resendCode} disabled={busy}>
              {resent ? "New code sent" : "Send a new code"}
            </button>
            <button type="button" className={styles.link} onClick={startOver}>
              Use a different email
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

/** Shown when a sign-in link from the email couldn't be used in this browser. */
function LinkNotice() {
  const params = useSearchParams();
  if (params.get("link") !== "invalid") return null;
  return (
    <p className={styles.notice}>
      That sign-in link only works in the browser it was requested from. Use the code in the
      email instead.
    </p>
  );
}
