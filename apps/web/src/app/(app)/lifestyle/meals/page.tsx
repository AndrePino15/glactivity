import type { Metadata } from "next";
import { LifestyleContent } from "../LifestyleContent";

export const metadata: Metadata = { title: "Meals" };

export default function MealsPage() {
  return <LifestyleContent tab="meals" />;
}
