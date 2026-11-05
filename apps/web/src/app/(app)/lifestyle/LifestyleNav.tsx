"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./nav.module.css";

const TABS = [
  { href: "/lifestyle", label: "Training" },
  { href: "/lifestyle/meals", label: "Meals" },
];

/** Training / Meals switch, styled like a segmented control. */
export function LifestyleNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Lifestyle">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={styles.tab} aria-current={pathname === tab.href ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
