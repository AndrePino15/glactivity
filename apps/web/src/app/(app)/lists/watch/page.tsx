import type { Metadata } from "next";
import { MediaList } from "../MediaList";

export const metadata: Metadata = { title: "Watch" };

export default function WatchPage() {
  return <MediaList kind="movies" />;
}
