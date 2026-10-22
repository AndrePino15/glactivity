import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ExamPaste } from "./ExamPaste";

export const metadata: Metadata = { title: "Exam timetable" };

export default function ExamsPage() {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Exams" />
      <ExamPaste />
    </>
  );
}
