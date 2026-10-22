"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./settings.module.css";

export function AccountCard() {
  const router = useRouter();
  const supabase = getSupabase();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [supabase]);

  if (!supabase) {
    return (
      <Card className={styles.padded}>
        <p className={styles.rowTitle}>Preview mode</p>
        <p className={styles.hint}>
          Glactivity isn’t connected to its database yet, so nothing is saved.
        </p>
      </Card>
    );
  }

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Card>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Signed in as</span>
        <span className={styles.rowValue}>{email ?? "…"}</span>
      </div>
      <button className={styles.destructive} onClick={signOut}>
        Sign out
      </button>
    </Card>
  );
}
