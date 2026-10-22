"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./login.module.css";

/**
 * Email + password sign-in. The account is created once in the Supabase
 * dashboard (sign-ups are closed), so no emails are ever sent.
 */
export function LoginForm() {
  const router = useRouter();
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setBusy(false);
      setError(
        error.code === "invalid_credentials"
          ? "That email and password don’t match."
          : error.message,
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <Mascot pose="standing" height={132} preload />
      <h1>Glactivity</h1>

      <form className={styles.form} onSubmit={signIn}>
        <input
          className={styles.input}
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="Email"
          aria-label="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={styles.input}
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className={styles.button} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
