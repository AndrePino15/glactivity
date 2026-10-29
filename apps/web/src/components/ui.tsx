"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { Mascot, type MascotPose } from "./Mascot";
import styles from "./ui.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * iOS-style large title, with either a small line above it or a back link,
 * and an optional action on the right.
 */
export function PageHeader({
  title,
  eyebrow,
  back,
  action,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        {back && (
          <Link href={back.href} className={styles.back}>
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
            {back.label}
          </Link>
        )}
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
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      {(title || action) && (
        <div className={styles.sectionHead}>
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Rows separated by hairlines. No box around them. */
export function List({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

type RowProps = {
  /** Interactive control before the row (e.g. a tick), kept outside the row's own tap target. */
  control?: ReactNode;
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  muted?: boolean;
  href?: string;
  external?: boolean;
  onClick?: () => void;
};

export function Row({ control, leading, title, detail, trailing, muted, href, external, onClick }: RowProps) {
  const body = (
    <>
      {leading && <span className={styles.rowLeading}>{leading}</span>}
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        {detail && <span className={styles.rowDetail}>{detail}</span>}
      </span>
    </>
  );
  const main = href ? (
    external ? (
      <a className={styles.rowMain} href={href} target="_blank" rel="noreferrer" onClick={onClick}>
        {body}
      </a>
    ) : (
      <Link className={styles.rowMain} href={href} onClick={onClick}>
        {body}
      </Link>
    )
  ) : onClick ? (
    <button type="button" className={styles.rowMain} onClick={onClick}>
      {body}
    </button>
  ) : (
    <span className={styles.rowMain}>{body}</span>
  );
  return (
    <li className={cx(styles.row, muted && styles.muted)}>
      {control}
      {main}
      {trailing && <span className={styles.rowTrailing}>{trailing}</span>}
    </li>
  );
}

/** A quiet line of secondary text. */
export function Note({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

/** Full-page empty state with the squirrel. */
export function EmptyState({
  pose,
  title,
  children,
}: {
  pose: MascotPose;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <Mascot pose={pose} height={140} preload className={styles.emptyMascot} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Button({ className, ...props }: ComponentProps<"button">) {
  return <button className={cx(styles.button, className)} {...props} />;
}

/** Plain text action, for secondary choices. */
export function TextButton({ className, ...props }: ComponentProps<"button">) {
  return <button type="button" className={cx(styles.textButton, className)} {...props} />;
}

/** A link that looks like a text action. */
export function TextLink({
  href,
  external,
  className,
  children,
}: {
  href: string;
  external?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cx(styles.textButton, className)}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cx(styles.textButton, className)}>
      {children}
    </Link>
  );
}

export function TextField({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(styles.field, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(styles.field, styles.select, className)} {...props} />;
}

export function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className={styles.label}>
      <span>{text}</span>
      {children}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={styles.segment}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Round tick for checklists. */
export function Check({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={styles.check}
      onClick={onToggle}
    />
  );
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.sheetBody}>
        <div className={styles.sheetHead}>
          <h2>{title}</h2>
          <TextButton onClick={onClose}>Close</TextButton>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
