"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/(app)/lifestyle/nav.module.css";

const TABS = [
  { href: "/tasks", label: "Tasks" },
  { href: "/tasks/goals", label: "Goals" },
];

/** Tasks / Goals switch, like Training / Meals in Lifestyle. */
export function TasksNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Tasks and goals">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={styles.tab} aria-current={pathname === tab.href ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
