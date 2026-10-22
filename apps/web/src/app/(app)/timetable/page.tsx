import type { Metadata } from "next";
import { Timetable } from "./Timetable";

export const metadata: Metadata = { title: "Timetable" };

export default function TimetablePage() {
  return <Timetable />;
}
