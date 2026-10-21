import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Fun" };

export default function FunPage() {
  return (
    <>
      <PageHeader title="Fun" />
      <EmptyState title="Room to play">Album of the week, daily games and what you’re reading or watching.</EmptyState>
    </>
  );
}
