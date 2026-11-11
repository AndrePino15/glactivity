-- Tasks you describe in your own words. The Tasks tab sends what you type to
-- the assistant as a note about a task; the next check (or a chat) turns it
-- into one or more tasks with set_up_tasks. See docs/claude-agent.md.

-- 'task': a note asking the assistant to set up a task. Only on inbox notes.
alter table public.agent_notes add column topic text check (topic = 'task');
alter table public.agent_notes add constraint agent_notes_topic_inbox check (topic is null or kind = 'inbox');

-- The context now says which new notes are task requests.
create or replace function public.agent_context(secret text, days_back integer default 7, days_ahead integer default 7)
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
        select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'topic', n.topic, 'added', n.created_at) order by n.created_at)
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

-- Turns one of your notes into tasks, all at once, and files the note. You
-- asked for these, so they're added whatever the autonomy setting.
-- tasks: [{title, due_on?, due_time?, estimate_minutes?, priority?, subject?, notes?}]
create function public.agent_set_up_tasks(secret text, note_id uuid, tasks jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  note public.agent_notes;
  t jsonb;
  ids jsonb := '[]'::jsonb;
  new_id uuid;
begin
  select * into note from public.agent_notes n where n.id = note_id and n.user_id = uid and n.kind = 'inbox';
  if not found then
    raise exception 'no such note' using errcode = 'P0002';
  end if;
  if note.status = 'used' then
    raise exception 'that note has already been set up' using errcode = '22023';
  end if;
  if jsonb_typeof(tasks) <> 'array' or jsonb_array_length(tasks) not between 1 and 10 then
    raise exception 'tasks must be a list of 1 to 10 tasks' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(tasks) loop
    perform private.check_change(t || '{"type": "add_task"}'::jsonb);
    insert into public.tasks (user_id, title, due_on, due_time, estimate_minutes, priority, subject, notes, source)
      values (uid, trim(t ->> 'title'), (t ->> 'due_on')::date, (t ->> 'due_time')::time, (t ->> 'estimate_minutes')::integer,
              coalesce((t ->> 'priority')::smallint, 2), nullif(trim(t ->> 'subject'), ''), nullif(trim(t ->> 'notes'), ''), 'claude')
      returning id into new_id;
    ids := ids || to_jsonb(new_id);
  end loop;
  update public.agent_notes n set status = 'used' where n.id = note.id;
  perform private.log_activity(uid,
    'Set up ' || (select string_agg(x ->> 'title', '; ') from jsonb_array_elements(tasks) x) || ' from your note',
    jsonb_build_object('note_id', note.id, 'task_ids', ids));
  return jsonb_build_object('task_ids', ids);
end;
$$;

revoke execute on function public.agent_set_up_tasks(text, uuid, jsonb) from public, authenticated;
grant execute on function public.agent_set_up_tasks(text, uuid, jsonb) to anon;
