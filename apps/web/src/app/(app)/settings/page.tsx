import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/ui";
import { AccountSection } from "./AccountSection";
import { AppearancePicker } from "./AppearancePicker";
import { CalendarsSection } from "./CalendarsSection";
import { GamesSection } from "./GamesSection";
import { HomeSettings } from "./HomeSettings";
import { NotificationsSection } from "./NotificationsSection";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Calendars">
        <CalendarsSection />
      </Section>
      <Section title="Notifications">
        <NotificationsSection />
      </Section>
      <HomeSettings />
      <Section title="Daily games">
        <GamesSection />
      </Section>
      <Section title="Appearance">
        <AppearancePicker />
      </Section>
      <Section title="Account">
        <AccountSection />
      </Section>
    </>
  );
}
