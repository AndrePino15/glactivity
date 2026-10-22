import type { Metadata } from "next";
import { MediaList } from "../MediaList";

export const metadata: Metadata = { title: "Read" };

export default function ReadPage() {
  return <MediaList kind="books" />;
}
