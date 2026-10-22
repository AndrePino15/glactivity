import type { Metadata } from "next";
import { RemindersList } from "./RemindersList";

export const metadata: Metadata = { title: "Reminders" };

export default function RemindersPage() {
  return <RemindersList />;
}
