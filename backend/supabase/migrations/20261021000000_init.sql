-- Glactivity initial schema.
-- Every personal table carries user_id (defaulting to the signed-in user) and is
-- locked down with row level security, so the web app can talk to the
-- database directly and only ever see its owner's rows.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.list_kind as enum ('shopping', 'movies', 'books', 'albums');
-- open: on the list · active: reading/watching now · done: bought, finished or heard
create type public.item_status as enum ('open', 'active', 'done');
create type public.source_kind as enum ('ics', 'exam_paste', 'manual');
create type public.event_category as enum
  ('lecture', 'exam', 'gym', 'meal', 'social', 'personal', 'other');
create type public.period_kind as enum ('term', 'break', 'exams');
create type public.recurrence as enum ('none', 'weekly', 'monthly', 'yearly');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  timezone text not null default 'Europe/London',
  -- Where you are right now: drives which public holidays and suggestions apply.
  current_country text not null default 'GB' check (current_country in ('GB', 'PT')),
  -- 0 = Sunday … 6 = Saturday. Ticked shopping items clear after this day.
  shopping_day smallint not null default 6 check (shopping_day between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Calendars & events
-- ---------------------------------------------------------------------------

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind public.source_kind not null,
  -- Private feed URL (e.g. the university timetable). Treat as a secret.
  url text,
  color text,
  default_category public.event_category not null default 'other',
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  check (kind <> 'ics' or url is not null)
);

create index calendar_sources_user_idx on public.calendar_sources (user_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source_id uuid references public.calendar_sources on delete cascade,
  -- The feed's UID, so re-syncs update events instead of duplicating them.
  external_uid text,
  title text not null,
  location text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  category public.event_category not null default 'other',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  unique (source_id, external_uid, starts_at)
);

create index events_user_time_idx on public.events (user_id, starts_at);

create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- Term, break and exam periods. Breaks can be detected from timetable gaps
-- (source = 'auto') and confirmed with one tap.
create table public.periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind public.period_kind not null,
  label text,
  country text check (country in ('GB', 'PT')),
  starts_on date not null,
  ends_on date not null,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  confirmed boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index periods_user_idx on public.periods (user_id, starts_on);

-- Public holidays for England and Portugal, shared by everyone and filled by a
-- scheduled job. Readable by any signed-in user, written only by the service role.
create table public.holidays (
  country text not null check (country in ('GB', 'PT')),
  date date not null,
  name text not null,
  primary key (country, date)
);

-- ---------------------------------------------------------------------------
-- Lists: shopping, movies, books, albums
-- ---------------------------------------------------------------------------

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  list public.list_kind not null,
  title text not null check (length(trim(title)) > 0),
  -- Artist, author or director.
  subtitle text,
  notes text,
  -- Cover art, Apple Music / book / film links, quantities…
  meta jsonb not null default '{}'::jsonb,
  status public.item_status not null default 'open',
  position double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index list_items_user_list_idx on public.list_items (user_id, list, status);

-- ---------------------------------------------------------------------------
-- Reminders (rent, bills…)
-- ---------------------------------------------------------------------------

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  notes text,
  -- First (or only) due date. Repeats keep its day of the month / weekday.
  due_on date not null,
  recurrence public.recurrence not null default 'none',
  notify_days_before smallint not null default 1 check (notify_days_before between 0 and 30),
  -- Latest occurrence marked as done, so the next one comes into view.
  last_done_on date,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index reminders_user_idx on public.reminders (user_id, due_on);

-- ---------------------------------------------------------------------------
-- Fun: album of the week, daily games
-- ---------------------------------------------------------------------------

-- One pick per week. Album details are copied in so the history survives
-- even if the list item is deleted.
create table public.album_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  list_item_id uuid references public.list_items on delete set null,
  title text not null,
  artist text,
  artwork_url text,
  apple_music_url text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  url text not null,
  emoji text,
  position smallint not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index games_user_idx on public.games (user_id, position);

create table public.game_plays (
  game_id uuid not null references public.games on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  played_on date not null,
  primary key (game_id, played_on)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.events enable row level security;
alter table public.periods enable row level security;
alter table public.holidays enable row level security;
alter table public.list_items enable row level security;
alter table public.reminders enable row level security;
alter table public.album_picks enable row level security;
alter table public.games enable row level security;
alter table public.game_plays enable row level security;

create policy "Own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'calendar_sources', 'events', 'periods', 'list_items',
    'reminders', 'album_picks', 'games', 'game_plays'
  ] loop
    execute format(
      'create policy "Own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;

create policy "Holidays are readable" on public.holidays
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- New users: create a profile and a starter set of daily games
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.games (user_id, name, url, emoji, position) values
    (new.id, 'Wordle',      'https://www.nytimes.com/games/wordle/index.html', '🟩', 1),
    (new.id, 'Connections', 'https://www.nytimes.com/games/connections',       '🔗', 2),
    (new.id, 'Strands',     'https://www.nytimes.com/games/strands',           '🧵', 3),
    (new.id, 'The Mini',    'https://www.nytimes.com/crosswords/game/mini',    '✏️', 4),
    (new.id, 'Worldle',     'https://worldle.teuteuf.fr',                      '🌍', 5),
    (new.id, 'Globle',      'https://globle-game.com',                         '🌐', 6),
    (new.id, 'Tradle',      'https://oec.world/en/games/tradle',               '🚢', 7),
    (new.id, 'Framed',      'https://framed.wtf',                              '🎬', 8);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
