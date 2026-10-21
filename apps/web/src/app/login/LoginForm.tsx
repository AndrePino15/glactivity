"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Squirrel } from "@/components/Squirrel";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./login.module.css";

type Step = { kind: "email" } | { kind: "code"; email: string };

/**
 * Sign in with a one-time code rather than a magic link: on iPhone a link opens
 * in Safari, not in the home-screen app, so the session would land in the
 * wrong place.
 */
export function LoginForm() {
  const router = useRouter();
  const supabase = getSupabase();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!supabase) {
    return (
      <main className={styles.page}>
        <Squirrel size={96} />
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

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const address = email.trim();
    const { error } = await supabase!.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStep({ kind: "code", email: address });
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== "code") return;
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.verifyOtp({
      email: step.email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <Squirrel size={96} />
      <h1>Glactivity</h1>

      {step.kind === "email" ? (
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
        </form>
      ) : (
        <form className={styles.form} onSubmit={verify}>
          <p className={styles.lead}>
            Enter the code sent to <strong>{step.email}</strong>.
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
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setStep({ kind: "email" });
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
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
