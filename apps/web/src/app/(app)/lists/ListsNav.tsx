"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./lists.module.css";

const LISTS = [
  { href: "/lists", label: "Shopping" },
  { href: "/lists/reminders", label: "Reminders" },
  { href: "/lists/watch", label: "Watch" },
  { href: "/lists/read", label: "Read" },
  { href: "/lists/listen", label: "Listen" },
];

export function ListsNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Lists">
      {LISTS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={styles.navItem}
          aria-current={pathname === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
