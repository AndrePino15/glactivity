import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Lists" };

export default function ListsPage() {
  return (
    <>
      <PageHeader title="Lists" />
      <EmptyState title="Nothing stashed yet">Your weekly shopping list, reminders like rent day, and things to watch, read and listen to.</EmptyState>
    </>
  );
}
