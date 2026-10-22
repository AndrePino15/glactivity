import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { FunContent } from "./FunContent";

export const metadata: Metadata = { title: "Fun" };

export default function FunPage() {
  return (
    <>
      <PageHeader title="Fun" />
      <FunContent />
    </>
  );
}
