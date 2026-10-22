import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Lifestyle" };

export default function LifestylePage() {
  return (
    <>
      <PageHeader title="Lifestyle" />
      <EmptyState pose="snacking" title="Workouts and meals are next">Your workout plan, gym options and weekly meal plan arrive in the next update.</EmptyState>
    </>
  );
}
