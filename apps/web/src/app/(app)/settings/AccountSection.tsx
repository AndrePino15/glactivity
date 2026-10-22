"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { List, Note, Row, TextButton } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./settings.module.css";

export function AccountSection() {
  const router = useRouter();
  const supabase = getSupabase();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [supabase]);

  if (!supabase) return <Note>Preview mode: Glactivity isn’t connected to its database, so nothing is saved.</Note>;

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={styles.stack}>
      <List>
        <Row title="Signed in as" trailing={email ?? "…"} />
      </List>
      <div>
        <TextButton className={styles.danger} onClick={signOut}>
          Sign out
        </TextButton>
      </div>
    </div>
  );
}
