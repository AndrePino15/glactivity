import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { RemindersList } from "./RemindersList";

export const metadata: Metadata = { title: "Reminders" };

export default function RemindersPage() {
  return (
    <>
      <PageHeader back={{ href: "/lists", label: "Lists" }} title="Reminders" />
      <RemindersList />
    </>
  );
}
