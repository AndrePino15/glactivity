import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { TasksNav } from "@/components/tasks/TasksNav";
import { TasksContent } from "./TasksContent";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Tasks" />
      <TasksNav />
      <TasksContent />
    </>
  );
}
