import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ShoppingList } from "./ShoppingList";

export const metadata: Metadata = { title: "Shopping" };

export default function ShoppingPage() {
  return (
    <>
      <PageHeader back={{ href: "/lists", label: "Lists" }} title="Shopping" />
      <ShoppingList />
    </>
  );
}
