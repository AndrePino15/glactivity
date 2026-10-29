import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { MediaList } from "../MediaList";

export const metadata: Metadata = { title: "Watch" };

export default function WatchPage() {
  return (
    <>
      <PageHeader back={{ href: "/lists", label: "Lists" }} title="Watch" />
      <MediaList kind="movies" />
    </>
  );
}
