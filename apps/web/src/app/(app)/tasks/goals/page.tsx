import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { TasksNav } from "@/components/tasks/TasksNav";
import { GoalsContent } from "./GoalsContent";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <>
      <PageHeader title="Tasks" />
      <TasksNav />
      <GoalsContent />
    </>
  );
}
