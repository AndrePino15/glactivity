import { Suspense } from "react";
import type { Metadata } from "next";
import { GoalDetail } from "./GoalDetail";

export const metadata: Metadata = { title: "Goal" };

/** The goal's id is only known at request time, so it's read inside Suspense. */
export default function GoalPage({ params }: PageProps<"/tasks/goals/[id]">) {
  return (
    <Suspense fallback={null}>
      <GoalFromParams params={params} />
    </Suspense>
  );
}

async function GoalFromParams({ params }: { params: PageProps<"/tasks/goals/[id]">["params"] }) {
  const { id } = await params;
  return <GoalDetail id={id} />;
}
