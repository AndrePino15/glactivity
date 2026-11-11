-- Phase 3, part 2, stage (b): tasks and deadlines, study blocks placed by the
-- planner, and how much the assistant may do on its own. See docs/claude-agent.md.

-- ---------------------------------------------------------------------------
-- How much the assistant may do
--   suggest:   it only proposes; nothing changes until you accept
--   plan:      it pencils study blocks into free time as tentative (default)
--   autopilot: it books study blocks and adds tasks itself, and says what it did
-- Anything involving other people, meals or shopping is always a suggestion.
-- ---------------------------------------------------------------------------

alter table public.profiles add column autonomy text not null default 'plan'
  check (autonomy in ('suggest', 'plan', 'autopilot'));

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  notes text check (length(notes) <= 2000),
  -- Module or subject, e.g. "COMP1201".
  subject text check (length(subject) <= 80),
  due_on date,
  due_time time,
  -- How long it should take, all in. Null when unknown.
  estimate_minutes integer check (estimate_minutes between 0 and 6000),
  -- 1 high, 2 normal, 3 low.
  priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  source text not null default 'app' check (source in ('app', 'claude')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (due_time is null or due_on is not null)
);

create index tasks_user_status_due_idx on public.tasks (user_id, status, due_on);

create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- Time set aside for a task.
--   tentative: pencilled in by the assistant, waiting for you to keep, move or skip
--   planned:   in your timetable (you added or kept it, or Autopilot booked it)
--   skipped:   you said no
--   withdrawn: the assistant re-planned and took it back
create table public.work_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'planned' check (status in ('tentative', 'planned', 'skipped', 'withdrawn')),
  source text not null default 'app' check (source in ('app', 'claude')),
  note text check (length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '4 hours')
);

create index work_blocks_user_time_idx on public.work_blocks (user_id, starts_at);
create index work_blocks_task_idx on public.work_blocks (task_id);

create trigger work_blocks_updated_at before update on public.work_blocks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
alter table public.work_blocks enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'work_blocks'] loop
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

-- A block can only belong to one of your own tasks.
create function private.block_task_is_owners() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.tasks t where t.id = new.task_id and t.user_id = new.user_id) then
    raise exception 'no such task' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
revoke execute on function private.block_task_is_owners() from public, anon, authenticated;

create trigger work_blocks_own_task before insert or update of task_id, user_id on public.work_blocks
  for each row execute function private.block_task_is_owners();

-- ---------------------------------------------------------------------------
-- Suggestions can now propose a task or a study block
-- ---------------------------------------------------------------------------

alter table public.agent_suggestions drop constraint agent_suggestions_change_check;
alter table public.agent_suggestions add constraint agent_suggestions_change_check check (
  change is null or (
    jsonb_typeof(change) = 'object'
    and change ->> 'type' in (
      'add_event', 'add_shopping_items', 'set_meal', 'add_reminder', 'add_list_item', 'add_task', 'add_work_block'
    )
  )
);

create or replace function private.check_change(change jsonb) returns void
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
  if kind is null or kind not in (
    'add_event', 'add_shopping_items', 'set_meal', 'add_reminder', 'add_list_item', 'add_task', 'add_work_block'
  ) then
    raise exception 'change.type must be add_event, add_shopping_items, set_meal, add_reminder, add_list_item, add_task or add_work_block'
      using errcode = '22023';
  end if;
  select string_agg(f, ', ') into missing
  from unnest(
    case kind
      when 'add_event' then array['title', 'starts_at', 'ends_at']
      when 'add_shopping_items' then array['items']
      when 'set_meal' then array['day', 'slot', 'title']
      when 'add_reminder' then array['title', 'due_on']
      when 'add_list_item' then array['list', 'title']
      when 'add_task' then array['title']
      when 'add_work_block' then array['task_id', 'starts_at', 'ends_at']
    end
  ) f
  where change -> f is null or change -> f = 'null'::jsonb;
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
    when 'add_task' then
      perform (change ->> 'due_on')::date;
      if coalesce((change ->> 'estimate_minutes')::integer, 0) not between 0 and 6000
         or coalesce((change ->> 'priority')::integer, 2) not between 1 and 3 then
        raise exception 'add_task: estimate_minutes 0–6000, priority 1 (high) to 3 (low)' using errcode = '22023';
      end if;
    when 'add_work_block' then
      perform (change ->> 'task_id')::uuid;
      if (change ->> 'ends_at')::timestamptz <= (change ->> 'starts_at')::timestamptz then
        raise exception 'add_work_block: ends_at must be after starts_at' using errcode = '22023';
      end if;
  end case;
end;
$$;
revoke execute on function private.check_change(jsonb) from public, anon, authenticated;

create or replace function public.accept_agent_suggestion(suggestion_id uuid) returns void
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
    when 'add_task' then
      insert into public.tasks (title, due_on, due_time, estimate_minutes, priority, subject, notes, source)
      values (c ->> 'title', (c ->> 'due_on')::date, (c ->> 'due_time')::time, (c ->> 'estimate_minutes')::integer,
              coalesce((c ->> 'priority')::smallint, 2), nullif(c ->> 'subject', ''), nullif(c ->> 'notes', ''), 'claude');
    when 'add_work_block' then
      insert into public.work_blocks (task_id, starts_at, ends_at, status, source)
      values ((c ->> 'task_id')::uuid, (c ->> 'starts_at')::timestamptz, (c ->> 'ends_at')::timestamptz, 'planned', 'claude');
    else
      null; -- An idea with no change attached: accepting just says "yes, good idea".
  end case;

  update public.agent_suggestions set status = 'accepted', responded_at = now() where id = s.id;
  insert into public.agent_activity (actor, summary, detail)
    values ('you', 'Accepted: ' || s.title, jsonb_build_object('suggestion_id', s.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: reading tasks and plans
-- ---------------------------------------------------------------------------

create function public.agent_plan_context(secret text, days_ahead integer default 14) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  tz text := coalesce((select p.timezone from public.profiles p where p.id = uid), 'Europe/London');
  today date := (now() at time zone tz)::date;
  to_day date := today + least(greatest(coalesce(days_ahead, 14), 1), 62);
begin
  return jsonb_build_object(
    'autonomy', (select p.autonomy from public.profiles p where p.id = uid),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'subject', t.subject, 'due_on', t.due_on, 'due_time', t.due_time,
        'estimate_minutes', t.estimate_minutes, 'priority', t.priority, 'status', t.status, 'notes', t.notes,
        'completed_at', t.completed_at,
        -- Planned time that has already passed (until blocks record what really happened).
        'spent_minutes', coalesce((
          select sum(extract(epoch from (least(b.ends_at, now()) - b.starts_at)) / 60)::integer
          from public.work_blocks b where b.task_id = t.id and b.status = 'planned' and b.starts_at < now()
        ), 0),
        'upcoming_minutes', coalesce((
          select sum(extract(epoch from (b.ends_at - greatest(b.starts_at, now()))) / 60)::integer
          from public.work_blocks b where b.task_id = t.id and b.status in ('planned', 'tentative') and b.ends_at > now()
        ), 0)
      ) order by t.due_on nulls last, t.priority, t.created_at)
      from public.tasks t
      where t.user_id = uid and (t.status = 'open' or t.updated_at > now() - interval '14 days')
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'task_id', b.task_id, 'task', t.title, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
        'status', b.status, 'source', b.source
      ) order by b.starts_at)
      from public.work_blocks b join public.tasks t on t.id = b.task_id
      where b.user_id = uid and b.status <> 'withdrawn'
        and b.ends_at > ((today - 7)::timestamp at time zone tz)
        and b.starts_at < ((to_day + 1)::timestamp at time zone tz)
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: tasks (when you ask in a chat, or Autopilot in a check)
-- ---------------------------------------------------------------------------

create function public.agent_add_task(
  secret text, title text, due_on date default null, due_time time default null,
  estimate_minutes integer default null, priority integer default 2, subject text default null, notes text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  new_id uuid;
begin
  insert into public.tasks (user_id, title, due_on, due_time, estimate_minutes, priority, subject, notes, source)
    values (uid, trim(title), due_on, due_time, estimate_minutes, coalesce(priority, 2)::smallint,
            nullif(trim(subject), ''), nullif(trim(notes), ''), 'claude')
    returning id into new_id;
  perform private.log_activity(uid,
    'Added a task: ' || trim(title) || coalesce(', due ' || to_char(due_on, 'Dy FMDD Mon'), ''),
    jsonb_build_object('task_id', new_id));
  return jsonb_build_object('id', new_id);
end;
$$;

-- Changes only what's given. status "done" or "dropped" closes the task and
-- takes back its future blocks; "open" reopens it.
create function public.agent_update_task(
  secret text, task_id uuid, title text default null, due_on date default null, due_time time default null,
  estimate_minutes integer default null, priority integer default null, subject text default null,
  notes text default null, status text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  t public.tasks;
begin
  select * into t from public.tasks x where x.id = agent_update_task.task_id and x.user_id = uid;
  if not found then
    raise exception 'no such task' using errcode = 'P0002';
  end if;
  if status is not null and status not in ('open', 'done', 'dropped') then
    raise exception 'status must be open, done or dropped' using errcode = '22023';
  end if;
  update public.tasks x set
    title = coalesce(nullif(trim(agent_update_task.title), ''), x.title),
    due_on = coalesce(agent_update_task.due_on, x.due_on),
    due_time = coalesce(agent_update_task.due_time, x.due_time),
    estimate_minutes = coalesce(agent_update_task.estimate_minutes, x.estimate_minutes),
    priority = coalesce(agent_update_task.priority::smallint, x.priority),
    subject = coalesce(nullif(trim(agent_update_task.subject), ''), x.subject),
    notes = coalesce(nullif(trim(agent_update_task.notes), ''), x.notes),
    status = coalesce(agent_update_task.status, x.status),
    completed_at = case
      when agent_update_task.status in ('done', 'dropped') then now()
      when agent_update_task.status = 'open' then null
      else x.completed_at
    end
  where x.id = t.id
  returning * into t;
  if t.status <> 'open' then
    update public.work_blocks b set status = 'withdrawn'
      where b.task_id = t.id and b.status in ('tentative', 'planned') and b.starts_at > now();
  end if;
  perform private.log_activity(uid,
    case t.status when 'done' then 'Marked done: ' when 'dropped' then 'Dropped: ' else 'Updated a task: ' end || t.title,
    jsonb_build_object('task_id', t.id));
  return jsonb_build_object('id', t.id, 'status', t.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: placing study blocks, following the autonomy setting
-- ---------------------------------------------------------------------------

-- blocks: [{task_id, starts_at, ends_at, note?}]. Each must be in the future,
-- 15 minutes to 4 hours, for an open task of yours, and clear of your timed
-- events and other blocks. Suggest mode turns them into suggestions; Plan
-- makes them tentative; Autopilot books them.
create function public.agent_plan_blocks(secret text, blocks jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  mode text := (select p.autonomy from public.profiles p where p.id = uid);
  tz text := coalesce((select p.timezone from public.profiles p where p.id = uid), 'Europe/London');
  b jsonb;
  t public.tasks;
  s timestamptz;
  e timestamptz;
  clash text;
  taken tstzrange[] := '{}';
  ids jsonb := '[]'::jsonb;
  new_id uuid;
  label text;
begin
  if jsonb_typeof(blocks) <> 'array' or jsonb_array_length(blocks) not between 1 and 12 then
    raise exception 'blocks must be a list of 1 to 12 blocks' using errcode = '22023';
  end if;
  for b in select * from jsonb_array_elements(blocks) loop
    select * into t from public.tasks x where x.id = (b ->> 'task_id')::uuid and x.user_id = uid;
    if not found or t.status <> 'open' then
      raise exception 'no open task with id %', b ->> 'task_id' using errcode = 'P0002';
    end if;
    s := (b ->> 'starts_at')::timestamptz;
    e := (b ->> 'ends_at')::timestamptz;
    if s is null or e is null or e - s < interval '15 minutes' or e - s > interval '4 hours' then
      raise exception 'each block needs starts_at and ends_at, 15 minutes to 4 hours apart' using errcode = '22023';
    end if;
    if s < now() then
      raise exception 'block for "%" starts in the past', t.title using errcode = '22023';
    end if;
    select ev.title || ' (' || to_char(ev.starts_at at time zone tz, 'Dy HH24:MI') || ')' into clash
      from public.events ev
      where ev.user_id = uid and not ev.all_day and ev.starts_at < e and ev.ends_at > s
      limit 1;
    if clash is null then
      select 'study block for ' || tt.title || ' (' || to_char(wb.starts_at at time zone tz, 'Dy HH24:MI') || ')' into clash
        from public.work_blocks wb join public.tasks tt on tt.id = wb.task_id
        where wb.user_id = uid and wb.status in ('tentative', 'planned') and wb.starts_at < e and wb.ends_at > s
        limit 1;
    end if;
    if clash is null and exists (select 1 from unnest(taken) r where r && tstzrange(s, e)) then
      clash := 'another block in this list';
    end if;
    if clash is not null then
      raise exception 'block for "%" at % clashes with %', t.title, to_char(s at time zone tz, 'Dy FMDD Mon HH24:MI'), clash
        using errcode = '22023';
    end if;
    taken := taken || tstzrange(s, e);

    label := to_char(s at time zone tz, 'Dy FMDD Mon, HH24:MI') || '–' || to_char(e at time zone tz, 'HH24:MI');
    if mode = 'suggest' then
      insert into public.agent_suggestions (user_id, day, title, detail, change)
        values (uid, (s at time zone tz)::date, 'Study: ' || t.title, label || coalesce('. ' || nullif(trim(b ->> 'note'), ''), ''),
                jsonb_build_object('type', 'add_work_block', 'task_id', t.id, 'starts_at', s, 'ends_at', e))
        returning id into new_id;
    else
      insert into public.work_blocks (user_id, task_id, starts_at, ends_at, status, source, note)
        values (uid, t.id, s, e, case when mode = 'autopilot' then 'planned' else 'tentative' end, 'claude',
                nullif(trim(b ->> 'note'), ''))
        returning id into new_id;
    end if;
    ids := ids || to_jsonb(new_id);
    perform private.log_activity(uid,
      case mode when 'suggest' then 'Suggested study time: ' when 'plan' then 'Pencilled in: ' else 'Booked: ' end
        || t.title || ', ' || label,
      jsonb_build_object(case when mode = 'suggest' then 'suggestion_id' else 'block_id' end, new_id));
  end loop;
  return jsonb_build_object(
    'mode', mode,
    'created_as', case mode when 'suggest' then 'suggestions' when 'plan' then 'tentative blocks' else 'booked blocks' end,
    'ids', ids
  );
end;
$$;

-- Takes back blocks the assistant placed, to re-plan. Only future blocks it
-- made itself that are still tentative (or, on Autopilot, that it booked).
create function public.agent_withdraw_blocks(secret text, block_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  mode text := (select p.autonomy from public.profiles p where p.id = uid);
  n integer;
begin
  update public.work_blocks b set status = 'withdrawn'
    where b.user_id = uid and b.id = any (block_ids) and b.source = 'claude' and b.starts_at > now()
      and (b.status = 'tentative' or (b.status = 'planned' and mode = 'autopilot'));
  get diagnostics n = row_count;
  if n > 0 then
    perform private.log_activity(uid, 'Took back ' || n || ' study block' || case when n = 1 then '' else 's' end || ' to re-plan');
  end if;
  return jsonb_build_object('withdrawn', n, 'not_changed', cardinality(block_ids) - n);
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.agent_plan_context(text, integer)',
    'public.agent_add_task(text, text, date, time, integer, integer, text, text)',
    'public.agent_update_task(text, uuid, text, date, time, integer, integer, text, text, text)',
    'public.agent_plan_blocks(text, jsonb)',
    'public.agent_withdraw_blocks(text, uuid[])'
  ] loop
    execute format('revoke execute on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop;
end;
$$;
