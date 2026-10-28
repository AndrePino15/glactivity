-- Fixes from Supabase's database advisors.

-- Pin the search path so the trigger can't be pointed at look-alike objects.
alter function public.set_updated_at() set search_path = '';

-- Index foreign keys: deleting a list item clears its album pick, and daily
-- game plays are looked up per user.
create index if not exists album_picks_list_item_idx on public.album_picks (list_item_id);
create index if not exists game_plays_user_day_idx on public.game_plays (user_id, played_on);
