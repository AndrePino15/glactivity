import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ListsHub } from "./ListsHub";

export const metadata: Metadata = { title: "Lists" };

export default function ListsPage() {
  return (
    <>
      <PageHeader title="Lists" />
      <ListsHub />
    </>
  );
}
