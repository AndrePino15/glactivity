import type { ReactNode } from "react";
import { Squirrel } from "./Squirrel";
import styles from "./ui.module.css";

/** iOS-style large title with an optional small line above and an action on the right. */
export function PageHeader({
  title,
  eyebrow,
  action,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </header>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `${styles.card} ${className}` : styles.card}>{children}</div>;
}

/** A quiet placeholder row: an icon tile, a line of text and a hint. */
export function Placeholder({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className={styles.placeholder}>
      <div className={styles.placeholderIcon}>{icon}</div>
      <div>
        <p className={styles.placeholderTitle}>{title}</p>
        <p className={styles.placeholderHint}>{hint}</p>
      </div>
    </div>
  );
}

/** Full-page empty state with the squirrel. */
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.empty}>
      <Squirrel size={112} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
