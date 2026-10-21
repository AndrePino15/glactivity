import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Timetable" };

export default function TimetablePage() {
  return (
    <>
      <PageHeader title="Timetable" />
      <EmptyState title="Stashing your calendars">Your Southampton timetable, exams and personal events will live here in day and week views.</EmptyState>
    </>
  );
}
