import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/ui";
import { AccountCard } from "./AccountCard";
import { AppearancePicker } from "./AppearancePicker";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Appearance">
        <AppearancePicker />
      </Section>
      <Section title="Account">
        <AccountCard />
      </Section>
    </>
  );
}
