import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { TasksContent } from "./TasksContent";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Tasks" />
      <TasksContent />
    </>
  );
}
