import type { Metadata } from "next";
import { Mascot } from "@/components/Mascot";
import { TodayContent } from "./TodayContent";
import { TodayHeader } from "./TodayHeader";
import styles from "./today.module.css";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <TodayHeader />
      <TodayContent />
      <footer className={styles.footer}>
        <Mascot pose="lounging" height={96} />
        <p>That’s everything for today.</p>
      </footer>
    </>
  );
}
