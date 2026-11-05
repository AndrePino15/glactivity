"use client";

import { Meals } from "@/components/lifestyle/Meals";
import { Training } from "@/components/lifestyle/Training";
import { useToday } from "@/lib/db/hooks";

export function LifestyleContent({ tab }: { tab: "training" | "meals" }) {
  const today = useToday();
  if (!today) return null;
  return tab === "training" ? <Training today={today} /> : <Meals today={today} />;
}
