-- Phase 3, part 2, stage (a): the Claude assistant.
--
-- Memory (notes, inbox, profile), the brief and suggestions it writes for
-- Today, and a log of everything it does. Claude reaches these through the
-- Glactivity connector at /api/mcp/<secret>; the secret lives only in
-- private.agent_links, and every function the connector calls checks it and
-- acts for that secret's owner only. Nothing here lets the connector delete.
-- See docs/claude-agent.md.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- What the assistant remembers.
--   inbox:   something you told it ("dentist next Tuesday"), new until a run files it
--   learned: something it noticed ("usually trains around 18:00")
--   profile: its one short page about you, rewritten as it learns (one per person)
create table public.agent_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('inbox', 'learned', 'profile')),
  body text not null check (
    length(trim(body)) > 0 and length(body) <= case when kind = 'profile' then 4000 else 1000 end
  ),
  status text check (status in ('new', 'used')),
  -- Who wrote it: you in the app, or Claude through the connector.
  source text not null default 'app' check (source in ('app', 'claude')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'inbox') = (status is not null))
);

create index agent_notes_user_idx on public.agent_notes (user_id, kind, created_at desc);
create unique index agent_notes_one_profile on public.agent_notes (user_id) where kind = 'profile';

create trigger agent_notes_updated_at before update on public.agent_notes
  for each row execute function public.set_updated_at();

-- One short brief per morning and evening, shown on Today.
create table public.agent_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  slot text not null check (slot in ('morning', 'evening')),
  body text not null check (length(trim(body)) > 0 and length(body) <= 1200),
  created_at timestamptz not null default now(),
  unique (user_id, day, slot)
);

-- Ideas for a day. A suggestion may carry one proposed change; nothing
-- changes until you tap Accept (accept_agent_suggestion below).
create table public.agent_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  title text not null check (length(trim(title)) > 0 and length(title) <= 120),
  detail text check (length(detail) <= 500),
  change jsonb check (
    change is null or (
      jsonb_typeof(change) = 'object'
      and change ->> 'type' in ('add_event', 'add_shopping_items', 'set_meal', 'add_reminder', 'add_list_item')
    )
  ),
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index agent_suggestions_user_day_idx on public.agent_suggestions (user_id, day);

-- What the assistant did, and what you accepted, so you can always see it.
create table public.agent_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  at timestamptz not null default now(),
  actor text not null check (actor in ('claude', 'you')),
  summary text not null check (length(trim(summary)) > 0 and length(summary) <= 500),
  detail jsonb not null default '{}'::jsonb
);

create index agent_activity_user_at_idx on public.agent_activity (user_id, at desc);

-- The secret in each person's connector link. Outside the API's reach.
create table private.agent_links (
  user_id uuid primary key references auth.users on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access for the signed-in owner (row level security)
-- ---------------------------------------------------------------------------

alter table public.agent_notes enable row level security;
alter table public.agent_briefs enable row level security;
alter table public.agent_suggestions enable row level security;
alter table public.agent_activity enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['agent_notes', 'agent_briefs', 'agent_suggestions'] loop
    execute format(
      'create policy "Own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- The log can be read and cleared, never rewritten: there is no update policy.
create policy "Own rows readable" on public.agent_activity for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Own rows addable" on public.agent_activity for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Own rows removable" on public.agent_activity for delete to authenticated
  using (user_id = (select auth.uid()));
revoke update on public.agent_activity from authenticated;
grant select, insert, delete on public.agent_activity to authenticated;

-- ---------------------------------------------------------------------------
-- The connector link
-- ---------------------------------------------------------------------------

-- 64 hex characters from two random UUIDs: 244 random bits.
create function private.new_agent_token() returns text
language sql volatile set search_path = ''
as $$ select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') $$;

-- Your connector secret, made the first time you open the page.
create function public.agent_link_token() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  found_token text;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select l.token into found_token from private.agent_links l where l.user_id = uid;
  if found_token is null then
    insert into private.agent_links (user_id, token) values (uid, private.new_agent_token())
      returning token into found_token;
  end if;
  return found_token;
end;
$$;

-- Replaces your secret: the old link stops working at once.
create function public.reset_agent_link() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_token text := private.new_agent_token();
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into private.agent_links (user_id, token) values (uid, new_token)
    on conflict (user_id) do update set token = excluded.token, created_at = now();
  insert into public.agent_activity (user_id, actor, summary) values (uid, 'you', 'Made a new connector link');
  return new_token;
end;
$$;

-- Whose link this is, or an error. Every connector function starts here.
create function private.agent_owner(secret text) returns uuid
language plpgsql stable set search_path = ''
as $$
declare
  uid uuid;
begin
  select l.user_id into uid from private.agent_links l where l.token = secret;
  if uid is null then
    raise exception 'invalid token' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- Lets the connector turn away a wrong link before anything runs.
create function public.agent_link_ok(secret text) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.agent_links l where l.token = secret) $$;

create function private.log_activity(uid uuid, summary text, detail jsonb default '{}'::jsonb) returns void
language sql set search_path = ''
as $$
  insert into public.agent_activity (user_id, actor, summary, detail)
  values (uid, 'claude', left(summary, 500), coalesce(detail, '{}'::jsonb));
$$;

-- Checks a proposed change and explains what's wrong, so Claude can fix it.
create function private.check_change(change jsonb) returns void
language plpgsql stable set search_path = ''
as $$
declare
  kind text := change ->> 'type';
  missing text;
begin
  if change is null then
    return;
  end if;
  if jsonb_typeof(change) <> 'object' then
    raise exception 'change must be an object' using errcode = '22023';
  end if;
  select string_agg(f, ', ') into missing
  from unnest(
    case kind
      when 'add_event' then array['title', 'starts_at', 'ends_at']
      when 'add_shopping_items' then array['items']
      when 'set_meal' then array['day', 'slot', 'title']
      when 'add_reminder' then array['title', 'due_on']
      when 'add_list_item' then array['list', 'title']
      else null
    end
  ) f
  where change -> f is null or change -> f = 'null'::jsonb;
  if kind is null or kind not in ('add_event', 'add_shopping_items', 'set_meal', 'add_reminder', 'add_list_item') then
    raise exception 'change.type must be add_event, add_shopping_items, set_meal, add_reminder or add_list_item'
      using errcode = '22023';
  end if;
  if missing is not null then
    raise exception '% needs: %', kind, missing using errcode = '22023';
  end if;
  case kind
    when 'add_event' then
      if (change ->> 'ends_at')::timestamptz < (change ->> 'starts_at')::timestamptz then
        raise exception 'add_event: ends_at is before starts_at' using errcode = '22023';
      end if;
      if change ? 'category' and change ->> 'category' not in ('lecture', 'exam', 'gym', 'meal', 'social', 'personal', 'other') then
        raise exception 'add_event: category must be lecture, exam, gym, meal, social, personal or other' using errcode = '22023';
      end if;
    when 'add_shopping_items' then
      if jsonb_typeof(change -> 'items') <> 'array' or jsonb_array_length(change -> 'items') = 0 then
        raise exception 'add_shopping_items: items must be a non-empty list of strings' using errcode = '22023';
      end if;
    when 'set_meal' then
      perform (change ->> 'day')::date;
      if change ->> 'slot' not in ('lunch', 'dinner') then
        raise exception 'set_meal: slot must be lunch or dinner' using errcode = '22023';
      end if;
    when 'add_reminder' then
      perform (change ->> 'due_on')::date;
      if coalesce(change ->> 'recurrence', 'none') not in ('none', 'weekly', 'monthly', 'yearly') then
        raise exception 'add_reminder: recurrence must be none, weekly, monthly or yearly' using errcode = '22023';
      end if;
    when 'add_list_item' then
      if change ->> 'list' not in ('shopping', 'movies', 'books', 'albums') then
        raise exception 'add_list_item: list must be shopping, movies, books or albums' using errcode = '22023';
      end if;
    else
      null;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: reading
-- ---------------------------------------------------------------------------

-- Everything a run needs in one call: plans, history, lists and memory.
create function public.agent_context(secret text, days_back integer default 7, days_ahead integer default 7)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  tz text := coalesce((select p.timezone from public.profiles p where p.id = uid), 'Europe/London');
  today date := (now() at time zone tz)::date;
  from_day date := today - least(greatest(coalesce(days_back, 7), 0), 31);
  to_day date := today + least(greatest(coalesce(days_ahead, 7), 0), 62);
begin
  return jsonb_build_object(
    'today', today,
    'now', now(),
    'timezone', tz,
    'range', jsonb_build_object('from', from_day, 'to', to_day),
    'profile', (
      select jsonb_build_object(
        'display_name', p.display_name, 'current_country', p.current_country,
        'shopping_day', (array['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])[p.shopping_day + 1]
      )
      from public.profiles p where p.id = uid
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'all_day', e.all_day,
        'category', e.category, 'location', e.location
      ) order by e.starts_at)
      from public.events e
      where e.user_id = uid
        and e.starts_at < ((to_day + 1)::timestamp at time zone tz)
        and e.ends_at > (from_day::timestamp at time zone tz)
    ), '[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id, 'source', pe.source, 'kind', pe.kind, 'label', pe.label, 'country', pe.country,
        'starts_on', pe.starts_on, 'ends_on', pe.ends_on, 'confirmed', pe.confirmed
      ) order by pe.starts_on)
      from public.periods pe where pe.user_id = uid and pe.ends_on >= from_day and pe.starts_on <= to_day + 90
    ), '[]'::jsonb),
    'training_plan', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', (array['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])[w.weekday + 1],
        'weekday_number', w.weekday,
        'title', w.title, 'kind', w.kind, 'preferred_time', w.preferred_time, 'details', w.details
      ) order by w.weekday)
      from public.workout_plan w where w.user_id = uid
    ), '[]'::jsonb),
    'training_log', coalesce((
      select jsonb_agg(jsonb_build_object('day', l.day, 'title', l.title, 'kind', l.kind, 'status', l.status, 'notes', l.notes) order by l.day)
      from public.workout_logs l where l.user_id = uid and l.day between from_day and today
    ), '[]'::jsonb),
    'meal_plan', coalesce((
      select jsonb_agg(jsonb_build_object('day', m.day, 'slot', m.slot, 'title', m.title) order by m.day, m.slot)
      from public.meal_plan m where m.user_id = uid and m.day between from_day and to_day
    ), '[]'::jsonb),
    'saved_meals', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'ingredients', s.ingredients) order by s.name)
      from public.meals s where s.user_id = uid
    ), '[]'::jsonb),
    'reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', r.title, 'due_on', r.due_on, 'recurrence', r.recurrence,
        'notify_days_before', r.notify_days_before, 'last_done_on', r.last_done_on
      ) order by r.due_on)
      from public.reminders r where r.user_id = uid and not r.archived
    ), '[]'::jsonb),
    'shopping_list', coalesce((
      select jsonb_agg(i.title order by i.position)
      from public.list_items i where i.user_id = uid and i.list = 'shopping' and i.status = 'open'
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object('list', i.list, 'title', i.title, 'by', i.subtitle, 'status', i.status) order by i.list, i.status, i.position)
      from public.list_items i
      where i.user_id = uid and i.list in ('movies', 'books', 'albums') and i.status in ('active', 'open')
    ), '[]'::jsonb),
    'album_of_the_week', (
      select jsonb_build_object('title', a.title, 'artist', a.artist, 'week_start', a.week_start)
      from public.album_picks a where a.user_id = uid order by a.week_start desc limit 1
    ),
    'games_played', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.played_on, 'count', d.n) order by d.played_on)
      from (
        select gp.played_on, count(*) as n from public.game_plays gp
        where gp.user_id = uid and gp.played_on between from_day and today group by gp.played_on
      ) d
    ), '[]'::jsonb),
    'rule_suggestion_feedback', coalesce((
      select jsonb_agg(jsonb_build_object('day', f.day, 'key', f.key, 'response', f.response) order by f.day)
      from public.suggestion_feedback f where f.user_id = uid and f.day between from_day and today
    ), '[]'::jsonb),
    'my_suggestions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', s.day, 'title', s.title, 'detail', s.detail, 'change', s.change, 'status', s.status
      ) order by s.day, s.created_at)
      from public.agent_suggestions s where s.user_id = uid and s.day between from_day and to_day
    ), '[]'::jsonb),
    'my_briefs', coalesce((
      select jsonb_agg(jsonb_build_object('day', b.day, 'slot', b.slot, 'body', b.body) order by b.day, b.slot)
      from public.agent_briefs b where b.user_id = uid and b.day between today - 2 and to_day
    ), '[]'::jsonb),
    'memory', jsonb_build_object(
      'profile', (select n.body from public.agent_notes n where n.user_id = uid and n.kind = 'profile'),
      'new_from_owner', coalesce((
        select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'added', n.created_at) order by n.created_at)
        from public.agent_notes n where n.user_id = uid and n.kind = 'inbox' and n.status = 'new'
      ), '[]'::jsonb),
      'filed_from_owner', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'added', x.created_at) order by x.created_at)
        from (
          select n.id, n.body, n.created_at from public.agent_notes n
          where n.user_id = uid and n.kind = 'inbox' and n.status = 'used'
          order by n.created_at desc limit 20
        ) x
      ), '[]'::jsonb),
      'learned', coalesce((
        select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'updated', n.updated_at) order by n.created_at)
        from public.agent_notes n where n.user_id = uid and n.kind = 'learned'
      ), '[]'::jsonb)
    ),
    'recent_activity', coalesce((
      select jsonb_agg(jsonb_build_object('at', x.at, 'actor', x.actor, 'summary', x.summary) order by x.at)
      from (
        select a.at, a.actor, a.summary from public.agent_activity a
        where a.user_id = uid order by a.at desc limit 20
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: memory
-- ---------------------------------------------------------------------------

-- Adds a learned note, or an inbox note when you tell Claude something in a chat.
create function public.agent_write_note(secret text, kind text, body text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  note public.agent_notes;
begin
  if kind not in ('inbox', 'learned') then
    raise exception 'kind must be inbox or learned (use set_profile for the profile)' using errcode = '22023';
  end if;
  insert into public.agent_notes (user_id, kind, body, status, source)
    values (uid, kind, trim(body), case when kind = 'inbox' then 'new' end, 'claude')
    returning * into note;
  perform private.log_activity(uid,
    case when kind = 'inbox' then 'Saved a note from you: ' else 'Learned: ' end || left(note.body, 200),
    jsonb_build_object('note_id', note.id));
  return jsonb_build_object('id', note.id, 'kind', note.kind, 'status', note.status);
end;
$$;

-- Rewrites a note, or files an inbox note once it has been read ("used").
create function public.agent_update_note(secret text, note_id uuid, body text default null, status text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  note public.agent_notes;
begin
  select * into note from public.agent_notes n where n.id = note_id and n.user_id = uid;
  if not found then
    raise exception 'no such note' using errcode = 'P0002';
  end if;
  if status is not null and (note.kind <> 'inbox' or status not in ('new', 'used')) then
    raise exception 'only inbox notes have a status (new or used)' using errcode = '22023';
  end if;
  update public.agent_notes n
    set body = coalesce(trim(agent_update_note.body), n.body),
        status = coalesce(agent_update_note.status, n.status)
    where n.id = note_id
    returning * into note;
  perform private.log_activity(uid,
    case
      when agent_update_note.body is null and agent_update_note.status = 'used' then 'Filed your note: ' || left(note.body, 200)
      else 'Updated a note: ' || left(note.body, 200)
    end,
    jsonb_build_object('note_id', note.id));
  return jsonb_build_object('id', note.id, 'kind', note.kind, 'status', note.status);
end;
$$;

-- Replaces the profile: one short page about the owner.
create function public.agent_set_profile(secret text, body text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
begin
  insert into public.agent_notes (user_id, kind, body, source) values (uid, 'profile', trim(body), 'claude')
    on conflict (user_id) where kind = 'profile' do update set body = excluded.body, source = 'claude';
  perform private.log_activity(uid, 'Updated what it knows about you');
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: brief and suggestions (scheduled runs propose; you accept)
-- ---------------------------------------------------------------------------

create function public.agent_set_brief(secret text, day date, slot text, body text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
begin
  if slot not in ('morning', 'evening') then
    raise exception 'slot must be morning or evening' using errcode = '22023';
  end if;
  insert into public.agent_briefs (user_id, day, slot, body) values (uid, day, slot, trim(body))
    on conflict on constraint agent_briefs_user_id_day_slot_key
    do update set body = excluded.body, created_at = now();
  perform private.log_activity(uid, 'Wrote the ' || slot || ' brief for ' || to_char(day, 'Dy FMDD Mon'));
end;
$$;

create function public.agent_add_suggestions(secret text, day date, items jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  item jsonb;
  ids jsonb := '[]'::jsonb;
  new_id uuid;
  open_count integer;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 3 then
    raise exception 'items must be a list of 1 to 3 suggestions' using errcode = '22023';
  end if;
  select count(*) into open_count from public.agent_suggestions s
    where s.user_id = uid and s.day = agent_add_suggestions.day and s.status = 'open';
  if open_count + jsonb_array_length(items) > 5 then
    raise exception 'that day already has % open suggestions; at most 5 at once', open_count using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(items) loop
    if coalesce(trim(item ->> 'title'), '') = '' then
      raise exception 'each suggestion needs a title' using errcode = '22023';
    end if;
    perform private.check_change(nullif(item -> 'change', 'null'::jsonb));
    insert into public.agent_suggestions (user_id, day, title, detail, change)
      values (uid, agent_add_suggestions.day, trim(item ->> 'title'), nullif(trim(item ->> 'detail'), ''),
              nullif(item -> 'change', 'null'::jsonb))
      returning id into new_id;
    ids := ids || to_jsonb(new_id);
  end loop;
  perform private.log_activity(uid,
    'Suggested ' || (select string_agg(i ->> 'title', '; ') from jsonb_array_elements(items) i),
    jsonb_build_object('suggestion_ids', ids));
  return jsonb_build_object('ids', ids);
end;
$$;

-- A run's own summary line ("Morning check: brief, 2 suggestions, 1 note filed").
create function public.agent_log(secret text, summary text, detail jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
begin
  perform private.log_activity(uid, summary, detail);
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: direct writes, only for when you ask Claude yourself in a chat
-- ---------------------------------------------------------------------------

create function public.agent_add_shopping_items(secret text, items text[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  added text[];
begin
  with wanted as (
    select distinct on (lower(trim(x))) trim(x) as title
    from unnest(items) x where length(trim(x)) between 1 and 200
  ), inserted as (
    insert into public.list_items (user_id, list, title)
    select uid, 'shopping', w.title from wanted w
    where not exists (
      select 1 from public.list_items i
      where i.user_id = uid and i.list = 'shopping' and i.status = 'open' and lower(i.title) = lower(w.title)
    )
    returning title
  )
  select coalesce(array_agg(title), '{}') into added from inserted;
  if cardinality(added) > 0 then
    perform private.log_activity(uid, 'Added to shopping: ' || array_to_string(added, ', '));
  end if;
  return jsonb_build_object('added', to_jsonb(added), 'already_on_list', cardinality(items) - cardinality(added));
end;
$$;

create function public.agent_add_event(
  secret text, title text, starts_at timestamptz, ends_at timestamptz,
  location text default null, category text default 'personal', all_day boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  new_id uuid;
begin
  perform private.check_change(jsonb_build_object(
    'type', 'add_event', 'title', title, 'starts_at', starts_at, 'ends_at', ends_at,
    'category', coalesce(category, 'personal')));
  insert into public.events (user_id, title, starts_at, ends_at, location, category, all_day)
    values (uid, trim(title), starts_at, ends_at, nullif(trim(location), ''),
            coalesce(category, 'personal')::public.event_category, coalesce(all_day, false))
    returning id into new_id;
  perform private.log_activity(uid, 'Added to your timetable: ' || trim(title), jsonb_build_object('event_id', new_id));
  return jsonb_build_object('id', new_id);
end;
$$;

create function public.agent_add_reminder(
  secret text, title text, due_on date, recurrence text default 'none', notify_days_before integer default 3
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  new_id uuid;
begin
  perform private.check_change(jsonb_build_object(
    'type', 'add_reminder', 'title', title, 'due_on', due_on, 'recurrence', coalesce(recurrence, 'none')));
  insert into public.reminders (user_id, title, due_on, recurrence, notify_days_before)
    values (uid, trim(title), due_on, coalesce(recurrence, 'none')::public.recurrence,
            least(greatest(coalesce(notify_days_before, 3), 0), 30))
    returning id into new_id;
  perform private.log_activity(uid, 'Added a reminder: ' || trim(title), jsonb_build_object('reminder_id', new_id));
  return jsonb_build_object('id', new_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Accepting a suggestion: runs as you, so row level security applies
-- ---------------------------------------------------------------------------

create function public.accept_agent_suggestion(suggestion_id uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  s public.agent_suggestions;
  c jsonb;
  meal public.meals;
begin
  select * into s from public.agent_suggestions x where x.id = suggestion_id and x.status = 'open' for update;
  if not found then
    raise exception 'suggestion not found or already answered' using errcode = 'P0002';
  end if;
  c := s.change;

  case c ->> 'type'
    when 'add_event' then
      insert into public.events (title, starts_at, ends_at, location, category, all_day)
      values (c ->> 'title', (c ->> 'starts_at')::timestamptz, (c ->> 'ends_at')::timestamptz,
              nullif(c ->> 'location', ''), coalesce(c ->> 'category', 'personal')::public.event_category,
              coalesce((c ->> 'all_day')::boolean, false));
    when 'add_shopping_items' then
      insert into public.list_items (list, title)
      select distinct on (lower(trim(x))) 'shopping'::public.list_kind, trim(x)
      from jsonb_array_elements_text(c -> 'items') x
      where length(trim(x)) > 0
        and not exists (
          select 1 from public.list_items i
          where i.list = 'shopping' and i.status = 'open' and lower(i.title) = lower(trim(x))
        );
    when 'set_meal' then
      select * into meal from public.meals m where lower(m.name) = lower(c ->> 'title') limit 1;
      insert into public.meal_plan (day, slot, title, meal_id)
      values ((c ->> 'day')::date, (c ->> 'slot')::public.meal_slot, c ->> 'title', meal.id)
      on conflict (user_id, day, slot) do update set title = excluded.title, meal_id = excluded.meal_id;
      -- Like planning a meal in the app: its missing ingredients go on the shopping list.
      if meal.id is not null then
        insert into public.list_items (list, title)
        select distinct on (lower(trim(x))) 'shopping'::public.list_kind, trim(x)
        from unnest(meal.ingredients) x
        where length(trim(x)) > 0
          and not exists (
            select 1 from public.list_items i
            where i.list = 'shopping' and i.status = 'open' and lower(i.title) = lower(trim(x))
          );
      end if;
    when 'add_reminder' then
      insert into public.reminders (title, due_on, recurrence, notify_days_before)
      values (c ->> 'title', (c ->> 'due_on')::date, coalesce(c ->> 'recurrence', 'none')::public.recurrence,
              least(greatest(coalesce((c ->> 'notify_days_before')::integer, 3), 0), 30));
    when 'add_list_item' then
      insert into public.list_items (list, title, subtitle)
      values ((c ->> 'list')::public.list_kind, c ->> 'title', nullif(c ->> 'subtitle', ''));
    else
      null; -- An idea with no change attached: accepting just says "yes, good idea".
  end case;

  update public.agent_suggestions set status = 'accepted', responded_at = now() where id = s.id;
  insert into public.agent_activity (actor, summary, detail)
    values ('you', 'Accepted: ' || s.title, jsonb_build_object('suggestion_id', s.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke execute on function private.new_agent_token() from public, anon, authenticated;
revoke execute on function private.agent_owner(text) from public, anon, authenticated;
revoke execute on function private.log_activity(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function private.check_change(jsonb) from public, anon, authenticated;

revoke execute on function public.agent_link_token() from public, anon;
revoke execute on function public.reset_agent_link() from public, anon;
revoke execute on function public.accept_agent_suggestion(uuid) from public, anon;
grant execute on function public.agent_link_token() to authenticated;
grant execute on function public.reset_agent_link() to authenticated;
grant execute on function public.accept_agent_suggestion(uuid) to authenticated;

-- Called by the connector without a signed-in user; the secret is the check.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.agent_link_ok(text)',
    'public.agent_context(text, integer, integer)',
    'public.agent_write_note(text, text, text)',
    'public.agent_update_note(text, uuid, text, text)',
    'public.agent_set_profile(text, text)',
    'public.agent_set_brief(text, date, text, text)',
    'public.agent_add_suggestions(text, date, jsonb)',
    'public.agent_log(text, text, jsonb)',
    'public.agent_add_shopping_items(text, text[])',
    'public.agent_add_event(text, text, timestamptz, timestamptz, text, text, boolean)',
    'public.agent_add_reminder(text, text, date, text, integer)'
  ] loop
    execute format('revoke execute on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop;
end;
$$;
