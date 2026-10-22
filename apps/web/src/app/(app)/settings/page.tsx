import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/ui";
import { AccountSection } from "./AccountSection";
import { AppearancePicker } from "./AppearancePicker";
import { CalendarsSection } from "./CalendarsSection";
import { HomeSettings } from "./HomeSettings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Calendars">
        <CalendarsSection />
      </Section>
      <HomeSettings />
      <Section title="Appearance">
        <AppearancePicker />
      </Section>
      <Section title="Account">
        <AccountSection />
      </Section>
    </>
  );
}
