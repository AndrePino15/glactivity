-- Add Krillion to the daily games: for new accounts and for existing ones.

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
    (target, 'Framed',      'https://framed.wtf',                              '🎬', 8),
    (target, 'Krillion',    'https://krillion.io',                             '🦐', 9);
$$;

-- create or replace keeps existing grants; restated so this file stands alone.
revoke execute on function public.seed_default_games(uuid) from public, anon, authenticated;

insert into public.games (user_id, name, url, emoji, position)
  select u.id, 'Krillion', 'https://krillion.io', '🦐',
         coalesce((select max(position) from public.games g where g.user_id = u.id), 0) + 1
  from auth.users u
  where not exists (select 1 from public.games g where g.user_id = u.id and g.name = 'Krillion');
