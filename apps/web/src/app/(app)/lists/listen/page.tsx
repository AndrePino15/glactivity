import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { MediaList } from "../MediaList";

export const metadata: Metadata = { title: "Listen" };

export default function ListenPage() {
  return (
    <>
      <PageHeader back={{ href: "/lists", label: "Lists" }} title="Listen" />
      <MediaList kind="albums" />
    </>
  );
}
