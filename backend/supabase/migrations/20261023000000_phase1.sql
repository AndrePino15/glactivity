-- Phase 1 housekeeping.

-- Spell out table access for signed-in users. Older Supabase projects grant
-- this automatically; newer ones may not. Row level security still limits
-- every query to the user's own rows.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Public holidays are fetched from gov.uk and a public holiday API when
-- needed, so the table is no longer used.
drop table if exists public.holidays;

-- Starter games, shared by the sign-up trigger and the backfill below.
create or replace function public.seed_default_games(target uuid) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.games (user_id, name, url, emoji, position) values
    (target, 'Wordle',      'https://www.nytimes.com/games/wordle/index.html', '🟩', 1),
    (target, 'Connections', 'https://www.nytimes.com/games/connections',       '🔗', 2),
    (target, 'Strands',     'https://www.nytimes.com/games/strands',           '🧵', 3),
    (target, 'The Mini',    'https://www.nytimes.com/crosswords/game/mini',    '✏️', 4),
    (target, 'Worldle',     'https://worldle.teuteuf.fr',                      '🌍', 5),
    (target, 'Globle',      'https://globle-game.com',                         '🌐', 6),
    (target, 'Tradle',      'https://oec.world/en/games/tradle',               '🚢', 7),
    (target, 'Framed',      'https://framed.wtf',                              '🎬', 8);
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  perform public.seed_default_games(new.id);
  return new;
end;
$$;

-- These run with elevated rights, and Postgres lets everyone execute new
-- functions by default, which would make them callable through the API.
-- Only the sign-up trigger needs them.
revoke execute on function public.seed_default_games(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Accounts created before the first migration ran have no profile or games.
insert into public.profiles (id)
  select id from auth.users
  on conflict do nothing;

select public.seed_default_games(u.id)
  from auth.users u
  where not exists (select 1 from public.games g where g.user_id = u.id);
