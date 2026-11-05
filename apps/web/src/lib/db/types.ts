/** Row shapes, mirroring backend/supabase/migrations. */

export type Country = "GB" | "PT";
export type ListKind = "shopping" | "movies" | "books" | "albums";
export type ItemStatus = "open" | "active" | "done";
export type SourceKind = "ics" | "exam_paste" | "manual";
export type EventCategory = "lecture" | "exam" | "gym" | "meal" | "social" | "personal" | "other";
export type PeriodKind = "term" | "break" | "exams";
export type Recurrence = "none" | "weekly" | "monthly" | "yearly";

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  current_country: Country;
  shopping_day: number;
};

export type CalendarSource = {
  id: string;
  name: string;
  kind: SourceKind;
  url: string | null;
  color: string | null;
  default_category: EventCategory;
  enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  source_id: string | null;
  external_uid: string | null;
  title: string;
  location: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  category: EventCategory;
};

export type Period = {
  id: string;
  kind: PeriodKind;
  label: string | null;
  country: Country | null;
  starts_on: string;
  ends_on: string;
  source: "manual" | "auto";
  confirmed: boolean;
};

/** Cover art and links for watch / read / listen items. */
export type ItemMeta = {
  artwork?: string;
  url?: string;
  year?: string;
};

export type ListItem = {
  id: string;
  list: ListKind;
  title: string;
  subtitle: string | null;
  notes: string | null;
  meta: ItemMeta;
  status: ItemStatus;
  position: number;
  created_at: string;
  completed_at: string | null;
};

export type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  due_on: string;
  recurrence: Recurrence;
  notify_days_before: number;
  last_done_on: string | null;
  last_notified_on?: string | null;
  archived: boolean;
};

export type AlbumPick = {
  id: string;
  week_start: string;
  list_item_id: string | null;
  title: string;
  artist: string | null;
  artwork_url: string | null;
  apple_music_url: string | null;
};

export type Game = {
  id: string;
  name: string;
  url: string;
  position: number;
  enabled: boolean;
};

export type GamePlay = { game_id: string; played_on: string };

export type WorkoutKind = "gym" | "home" | "run" | "sport" | "rest";

export type WorkoutPlanDay = {
  id: string;
  weekday: number; // 0 = Sunday … 6 = Saturday
  title: string;
  kind: WorkoutKind;
  preferred_time: string | null; // "HH:MM:SS"
  details: string | null;
};

export type WorkoutLog = {
  id: string;
  day: string;
  title: string;
  kind: WorkoutKind;
  status: "done" | "skipped";
  notes: string | null;
};

export type MealSlot = "lunch" | "dinner";

export type Meal = {
  id: string;
  name: string;
  ingredients: string[];
  notes: string | null;
};

export type MealPlanEntry = {
  id: string;
  day: string;
  slot: MealSlot;
  title: string;
  meal_id: string | null;
};
