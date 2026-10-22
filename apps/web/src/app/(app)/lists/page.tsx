import type { Metadata } from "next";
import { ShoppingList } from "./ShoppingList";

export const metadata: Metadata = { title: "Shopping" };

export default function ShoppingPage() {
  return <ShoppingList />;
}
