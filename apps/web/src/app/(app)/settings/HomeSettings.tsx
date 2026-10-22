"use client";

import { Note, Section, Segmented, Select } from "@/components/ui";
import { write } from "@/lib/db/client";
import { useProfile } from "@/lib/db/hooks";
import type { Country, Profile } from "@/lib/db/types";
import styles from "./settings.module.css";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function HomeSettings() {
  const { data: profile, mutate } = useProfile();
  if (!profile) return null;

  async function update(patch: Partial<Profile>) {
    await mutate(
      async () => {
        await write((db) => db.from("profiles").update(patch).eq("id", profile!.id));
        return undefined;
      },
      { optimisticData: { ...profile!, ...patch }, populateCache: false, revalidate: true },
    );
  }

  return (
    <>
      <Section title="Where you are">
        <div className={styles.stack}>
          <Segmented<Country>
            label="Where you are"
            value={profile.current_country}
            options={[
              { value: "GB", label: "UK" },
              { value: "PT", label: "Portugal" },
            ]}
            onChange={(current_country) => update({ current_country })}
          />
          <Note>Decides which public holidays show up. Confirming a trip home during a break switches it for those dates.</Note>
        </div>
      </Section>
      <Section title="Shopping day">
        <Select
          aria-label="Shopping day"
          value={profile.shopping_day}
          onChange={(e) => update({ shopping_day: Number(e.target.value) })}
        >
          {WEEKDAYS.map((day, i) => (
            <option key={day} value={i}>
              {day}
            </option>
          ))}
        </Select>
      </Section>
    </>
  );
}
