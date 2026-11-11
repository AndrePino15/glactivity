import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { AssistantSettings } from "./AssistantSettings";

export const metadata: Metadata = { title: "Assistant" };

export default function AssistantPage() {
  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Assistant" />
      <AssistantSettings />
    </>
  );
}
