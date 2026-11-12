"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { Mascot } from "./Mascot";
import styles from "./Navigation.module.css";

/**
 * Pages whose address holds an id (a goal) only know it at request time, so
 * the highlighted tab waits in Suspense; the bar itself shows straight away.
 */
export function TabBar() {
  return (
    <Suspense fallback={<TabBarView pathname={null} />}>
      <TabBarHere />
    </Suspense>
  );
}

export function Sidebar() {
  return (
    <Suspense fallback={<SidebarView pathname={null} />}>
      <SidebarHere />
    </Suspense>
  );
}

function TabBarHere() {
  return <TabBarView pathname={usePathname()} />;
}

function SidebarHere() {
  return <SidebarView pathname={usePathname()} />;
}

/** Bottom tab bar on phones. */
function TabBarView({ pathname }: { pathname: string | null }) {
  return (
    <nav className={styles.tabBar} aria-label="Main">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={styles.tab}
            data-active={active || undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={24} strokeWidth={active ? 2.2 : 1.7} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar on iPad landscape and laptops. */
function SidebarView({ pathname }: { pathname: string | null }) {
  const items = [...NAV_ITEMS, { href: "/settings", label: "Settings", icon: Settings }];
  return (
    <nav className={styles.sidebar} aria-label="Main">
      <Link href="/" className={styles.brand}>
        <Mascot pose="standing" height={36} preload />
        <span>Glactivity</span>
      </Link>
      <ul>
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname !== null && isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={styles.row}
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
