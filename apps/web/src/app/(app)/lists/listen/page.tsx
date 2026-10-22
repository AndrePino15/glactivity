import type { Metadata } from "next";
import { MediaList } from "../MediaList";

export const metadata: Metadata = { title: "Listen" };

export default function ListenPage() {
  return <MediaList kind="albums" />;
}
