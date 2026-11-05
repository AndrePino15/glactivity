import type { Metadata } from "next";
import { LifestyleContent } from "./LifestyleContent";

export const metadata: Metadata = { title: "Training" };

export default function TrainingPage() {
  return <LifestyleContent tab="training" />;
}
