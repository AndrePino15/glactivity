"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { formatDayHeading, greetingFor } from "@/lib/greeting";
import { useNow } from "@/lib/use-now";
import styles from "./today.module.css";

export function TodayHeader() {
  const now = useNow();
  return (
    <PageHeader
      eyebrow={now ? formatDayHeading(now) : " "}
      title={now ? greetingFor(now) : "Today"}
      action={
        <Link href="/settings" className={styles.iconButton} aria-label="Settings">
          <Settings size={20} strokeWidth={1.9} />
        </Link>
      }
    />
  );
}
