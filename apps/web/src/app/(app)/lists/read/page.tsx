import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { MediaList } from "../MediaList";

export const metadata: Metadata = { title: "Read" };

export default function ReadPage() {
  return (
    <>
      <PageHeader back={{ href: "/lists", label: "Lists" }} title="Read" />
      <MediaList kind="books" />
    </>
  );
}
