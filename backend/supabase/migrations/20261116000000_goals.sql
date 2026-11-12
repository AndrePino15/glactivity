-- Phase 3, part 2, stage (c): goals and big projects. A goal breaks into
-- milestones and milestones into tasks, which the planner turns into study
-- blocks. Goals you describe in the app are drafted by the assistant with
-- questions for you; you answer on the goal page and it refines the draft.
-- See docs/claude-agent.md.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

--   draft:  planned by the assistant from your description, waiting for you
--   active: you're working on it; the planner places its tasks
--   paused / done
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  why text check (length(why) <= 2000),
  -- Null: someday.
  target_date date,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'done')),
  source text not null default 'app' check (source in ('app', 'claude')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_user_status_idx on public.goals (user_id, status);
create trigger goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references public.goals on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  target_date date,
  position integer not null default 0,
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  -- Dates from the outside world (application deadlines): where it came from,
  -- and whether you've confirmed it. Shown as "to confirm" until you do.
  date_source_url text check (date_source_url ~ '^https?://' and length(date_source_url) <= 1000),
  date_confirmed boolean not null default true,
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index milestones_goal_idx on public.milestones (goal_id, position);
create index milestones_user_idx on public.milestones (user_id);
create trigger milestones_updated_at before update on public.milestones
  for each row execute function public.set_updated_at();

-- Notes on a goal:
--   question: the assistant asks you something (resolved once it's dealt with)
--   answer:   your reply in your own words (resolved once the plan uses it)
--   note:     anything worth keeping
--   source:   an official page a date or requirement came from
create table public.goal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references public.goals on delete cascade,
  kind text not null check (kind in ('question', 'answer', 'note', 'source')),
  body text not null check (length(trim(body)) > 0 and length(body) <= 2000),
  url text check (url ~ '^https?://' and length(url) <= 1000),
  resolved boolean not null default false,
  source text not null default 'app' check (source in ('app', 'claude')),
  created_at timestamptz not null default now()
);

create index goal_notes_goal_idx on public.goal_notes (goal_id, created_at);
create index goal_notes_user_idx on public.goal_notes (user_id);

alter table public.tasks add column milestone_id uuid references public.milestones on delete set null;
create index tasks_milestone_idx on public.tasks (milestone_id);

alter table public.goals enable row level security;
alter table public.milestones enable row level security;
alter table public.goal_notes enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['goals', 'milestones', 'goal_notes'] loop
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

-- Milestones, notes and tasks can only point at your own goal / milestone.
create function private.goal_parts_are_owners() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name in ('milestones', 'goal_notes') then
    if not exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id) then
      raise exception 'no such goal' using errcode = 'P0002';
    end if;
  elsif tg_table_name = 'tasks' and new.milestone_id is not null then
    if not exists (select 1 from public.milestones m where m.id = new.milestone_id and m.user_id = new.user_id) then
      raise exception 'no such milestone' using errcode = 'P0002';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.goal_parts_are_owners() from public, anon, authenticated;

create trigger milestones_own_goal before insert or update of goal_id, user_id on public.milestones
  for each row execute function private.goal_parts_are_owners();
create trigger goal_notes_own_goal before insert or update of goal_id, user_id on public.goal_notes
  for each row execute function private.goal_parts_are_owners();
create trigger tasks_own_milestone before insert or update of milestone_id, user_id on public.tasks
  for each row execute function private.goal_parts_are_owners();

-- Study time only for tasks of goals you're working on (not drafts or paused).
create or replace function private.block_task_is_owners() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  goal_status text;
begin
  if not exists (select 1 from public.tasks t where t.id = new.task_id and t.user_id = new.user_id) then
    raise exception 'no such task' using errcode = 'P0002';
  end if;
  if new.status in ('tentative', 'planned') then
    select g.status into goal_status
      from public.tasks t join public.milestones m on m.id = t.milestone_id join public.goals g on g.id = m.goal_id
      where t.id = new.task_id;
    if goal_status in ('draft', 'paused', 'done') then
      raise exception 'that task belongs to a goal that is %, so it isn''t planned yet', goal_status using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.block_task_is_owners() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Goals described in the app, and the weekly review
-- ---------------------------------------------------------------------------

alter table public.agent_notes drop constraint agent_notes_topic_check;
alter table public.agent_notes add constraint agent_notes_topic_check check (topic in ('task', 'goal'));

-- "This week for your goals", written by the Sunday evening check.
alter table public.agent_briefs drop constraint agent_briefs_slot_check;
alter table public.agent_briefs add constraint agent_briefs_slot_check check (slot in ('morning', 'evening', 'week'));

create or replace function public.agent_set_brief(secret text, day date, slot text, body text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
begin
  if slot not in ('morning', 'evening', 'week') then
    raise exception 'slot must be morning, evening or week' using errcode = '22023';
  end if;
  insert into public.agent_briefs (user_id, day, slot, body) values (uid, day, slot, trim(body))
    on conflict on constraint agent_briefs_user_id_day_slot_key
    do update set body = excluded.body, created_at = now();
  perform private.log_activity(uid,
    case when slot = 'week' then 'Wrote this week for your goals'
         else 'Wrote the ' || slot || ' brief for ' || to_char(day, 'Dy FMDD Mon') end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: reading goals
-- ---------------------------------------------------------------------------

create function public.agent_goal_context(secret text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
begin
  return jsonb_build_object(
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'why', g.why, 'target_date', g.target_date, 'status', g.status,
        'updated_at', g.updated_at,
        'milestones', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id, 'title', m.title, 'target_date', m.target_date, 'position', m.position, 'status', m.status,
            'date_source_url', m.date_source_url, 'date_confirmed', m.date_confirmed, 'notes', m.notes,
            'tasks', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', t.id, 'title', t.title, 'status', t.status, 'due_on', t.due_on,
                'estimate_minutes', t.estimate_minutes, 'priority', t.priority,
                'spent_minutes', coalesce((
                  select sum(extract(epoch from (least(b.ends_at, now()) - b.starts_at)) / 60)::integer
                  from public.work_blocks b where b.task_id = t.id and b.status = 'planned' and b.starts_at < now()
                ), 0),
                'next_block', (
                  select min(b.starts_at) from public.work_blocks b
                  where b.task_id = t.id and b.status in ('planned', 'tentative') and b.starts_at > now()
                )
              ) order by t.due_on nulls last, t.created_at)
              from public.tasks t where t.milestone_id = m.id
            ), '[]'::jsonb)
          ) order by m.position, m.target_date nulls last)
          from public.milestones m where m.goal_id = g.id
        ), '[]'::jsonb),
        'notes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', n.id, 'kind', n.kind, 'body', n.body, 'url', n.url, 'resolved', n.resolved, 'added', n.created_at
          ) order by n.created_at)
          from public.goal_notes n where n.goal_id = g.id
        ), '[]'::jsonb)
      ) order by g.status, g.target_date nulls last)
      from public.goals g
      where g.user_id = uid and (g.status <> 'done' or g.updated_at > now() - interval '30 days')
    ), '[]'::jsonb),
    'this_week_for_goals', (
      select jsonb_build_object('day', b.day, 'body', b.body)
      from public.agent_briefs b where b.user_id = uid and b.slot = 'week' order by b.day desc limit 1
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: saving a whole plan in one go
-- ---------------------------------------------------------------------------

-- plan: {
--   goal: {id?, title, why?, target_date?, status? ('draft' | 'active' | 'paused' | 'done')},
--   milestones?: [{id?, title, target_date?, position?, status?, date_source_url?, date_confirmed?, notes?,
--                  tasks?: [{id?, title, estimate_minutes?, due_on?, due_time?, priority?, subject?, notes?}]}],
--   sources?: [{title, url, note?}], questions?: [text], notes?: text,
--   from_note_id?: an inbox note this plan answers (filed once saved)
-- }
-- New goals start as drafts unless status says otherwise. Milestones and tasks
-- with an id are updated; without one they're added (after the existing ones).
-- Nothing is deleted: drop a milestone with status "dropped", a task with update_task.
create function public.agent_save_goal_plan(secret text, plan jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  g jsonb := plan -> 'goal';
  goal public.goals;
  m jsonb;
  t jsonb;
  s jsonb;
  q text;
  ms_id uuid;
  next_position integer;
  task_ids jsonb := '[]'::jsonb;
  milestone_ids jsonb := '[]'::jsonb;
  is_new boolean;
begin
  if g is null or jsonb_typeof(g) <> 'object' then
    raise exception 'plan.goal is required' using errcode = '22023';
  end if;
  if g ->> 'status' is not null and g ->> 'status' not in ('draft', 'active', 'paused', 'done') then
    raise exception 'goal.status must be draft, active, paused or done' using errcode = '22023';
  end if;

  is_new := g ->> 'id' is null;
  if is_new then
    if coalesce(trim(g ->> 'title'), '') = '' then
      raise exception 'a new goal needs a title' using errcode = '22023';
    end if;
    insert into public.goals (user_id, title, why, target_date, status, source)
      values (uid, trim(g ->> 'title'), nullif(trim(g ->> 'why'), ''), (g ->> 'target_date')::date,
              coalesce(g ->> 'status', 'draft'), 'claude')
      returning * into goal;
  else
    update public.goals x set
      title = coalesce(nullif(trim(g ->> 'title'), ''), x.title),
      why = case when g ? 'why' then nullif(trim(g ->> 'why'), '') else x.why end,
      target_date = case when g ? 'target_date' then (g ->> 'target_date')::date else x.target_date end,
      status = coalesce(g ->> 'status', x.status)
    where x.id = (g ->> 'id')::uuid and x.user_id = uid
    returning * into goal;
    if goal.id is null then
      raise exception 'no such goal' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(max(x.position), -1) + 1 into next_position from public.milestones x where x.goal_id = goal.id;
  for m in select * from jsonb_array_elements(coalesce(plan -> 'milestones', '[]'::jsonb)) loop
    if m ->> 'status' is not null and m ->> 'status' not in ('open', 'done', 'dropped') then
      raise exception 'milestone.status must be open, done or dropped' using errcode = '22023';
    end if;
    if m ->> 'id' is null then
      if coalesce(trim(m ->> 'title'), '') = '' then
        raise exception 'each new milestone needs a title' using errcode = '22023';
      end if;
      insert into public.milestones (user_id, goal_id, title, target_date, position, status, date_source_url, date_confirmed, notes)
        values (uid, goal.id, trim(m ->> 'title'), (m ->> 'target_date')::date,
                coalesce((m ->> 'position')::integer, next_position), coalesce(m ->> 'status', 'open'),
                nullif(m ->> 'date_source_url', ''),
                -- A date taken from an outside source stays "to confirm" until you confirm it.
                coalesce((m ->> 'date_confirmed')::boolean, nullif(m ->> 'date_source_url', '') is null),
                nullif(trim(m ->> 'notes'), ''))
        returning id into ms_id;
      next_position := next_position + 1;
    else
      update public.milestones x set
        title = coalesce(nullif(trim(m ->> 'title'), ''), x.title),
        target_date = case when m ? 'target_date' then (m ->> 'target_date')::date else x.target_date end,
        position = coalesce((m ->> 'position')::integer, x.position),
        status = coalesce(m ->> 'status', x.status),
        date_source_url = case when m ? 'date_source_url' then nullif(m ->> 'date_source_url', '') else x.date_source_url end,
        date_confirmed = coalesce((m ->> 'date_confirmed')::boolean, x.date_confirmed),
        notes = case when m ? 'notes' then nullif(trim(m ->> 'notes'), '') else x.notes end
      where x.id = (m ->> 'id')::uuid and x.goal_id = goal.id
      returning x.id into ms_id;
      if ms_id is null then
        raise exception 'no milestone % in this goal', m ->> 'id' using errcode = 'P0002';
      end if;
    end if;
    milestone_ids := milestone_ids || to_jsonb(ms_id);

    for t in select * from jsonb_array_elements(coalesce(m -> 'tasks', '[]'::jsonb)) loop
      perform private.check_change(t || '{"type": "add_task"}'::jsonb);
      if t ->> 'id' is null then
        insert into public.tasks (user_id, milestone_id, title, estimate_minutes, due_on, due_time, priority, subject, notes, source)
          values (uid, ms_id, trim(t ->> 'title'), (t ->> 'estimate_minutes')::integer, (t ->> 'due_on')::date,
                  (t ->> 'due_time')::time, coalesce((t ->> 'priority')::smallint, 2),
                  coalesce(nullif(trim(t ->> 'subject'), ''), left(goal.title, 80)), nullif(trim(t ->> 'notes'), ''), 'claude')
          returning to_jsonb(id) into s;
      else
        update public.tasks x set
          milestone_id = ms_id,
          title = coalesce(nullif(trim(t ->> 'title'), ''), x.title),
          estimate_minutes = coalesce((t ->> 'estimate_minutes')::integer, x.estimate_minutes),
          due_on = case when t ? 'due_on' then (t ->> 'due_on')::date else x.due_on end,
          priority = coalesce((t ->> 'priority')::smallint, x.priority),
          notes = case when t ? 'notes' then nullif(trim(t ->> 'notes'), '') else x.notes end
        where x.id = (t ->> 'id')::uuid and x.user_id = uid
        returning to_jsonb(x.id) into s;
        if s is null then
          raise exception 'no such task %', t ->> 'id' using errcode = 'P0002';
        end if;
      end if;
      task_ids := task_ids || s;
      s := null;
    end loop;
  end loop;

  for s in select * from jsonb_array_elements(coalesce(plan -> 'sources', '[]'::jsonb)) loop
    insert into public.goal_notes (user_id, goal_id, kind, body, url, source)
      values (uid, goal.id, 'source',
              trim(coalesce(s ->> 'title', s ->> 'url')) || coalesce(': ' || nullif(trim(s ->> 'note'), ''), ''),
              s ->> 'url', 'claude');
  end loop;
  for q in select jsonb_array_elements_text(coalesce(plan -> 'questions', '[]'::jsonb)) loop
    insert into public.goal_notes (user_id, goal_id, kind, body, source) values (uid, goal.id, 'question', trim(q), 'claude');
  end loop;
  if coalesce(trim(plan ->> 'notes'), '') <> '' then
    insert into public.goal_notes (user_id, goal_id, kind, body, source) values (uid, goal.id, 'note', trim(plan ->> 'notes'), 'claude');
  end if;

  if plan ->> 'from_note_id' is not null then
    update public.agent_notes n set status = 'used'
      where n.id = (plan ->> 'from_note_id')::uuid and n.user_id = uid and n.kind = 'inbox';
  end if;

  perform private.log_activity(uid,
    case
      when is_new and goal.status = 'draft' then 'Drafted a plan for your goal: '
      when is_new then 'Added a goal: '
      else 'Updated the plan for: '
    end || goal.title
      || case when jsonb_array_length(milestone_ids) > 0 then ' (' || jsonb_array_length(milestone_ids) || ' milestones, ' || jsonb_array_length(task_ids) || ' tasks)' else '' end,
    jsonb_build_object('goal_id', goal.id));
  return jsonb_build_object('goal_id', goal.id, 'status', goal.status, 'milestone_ids', milestone_ids, 'task_ids', task_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- Connector: smaller changes
-- ---------------------------------------------------------------------------

create function public.agent_update_milestone(
  secret text, milestone_id uuid, title text default null, target_date date default null, status text default null,
  date_source_url text default null, date_confirmed boolean default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  m public.milestones;
begin
  if status is not null and status not in ('open', 'done', 'dropped') then
    raise exception 'status must be open, done or dropped' using errcode = '22023';
  end if;
  update public.milestones x set
    title = coalesce(nullif(trim(agent_update_milestone.title), ''), x.title),
    target_date = coalesce(agent_update_milestone.target_date, x.target_date),
    status = coalesce(agent_update_milestone.status, x.status),
    date_source_url = coalesce(nullif(agent_update_milestone.date_source_url, ''), x.date_source_url),
    date_confirmed = coalesce(agent_update_milestone.date_confirmed, x.date_confirmed)
  where x.id = agent_update_milestone.milestone_id and x.user_id = uid
  returning * into m;
  if m.id is null then
    raise exception 'no such milestone' using errcode = 'P0002';
  end if;
  perform private.log_activity(uid,
    case m.status when 'done' then 'Milestone done: ' when 'dropped' then 'Dropped milestone: ' else 'Updated milestone: ' end || m.title,
    jsonb_build_object('milestone_id', m.id));
  return jsonb_build_object('id', m.id, 'status', m.status);
end;
$$;

-- kind: note, source or question. Or mark notes resolved (questions dealt
-- with, answers used) by passing resolve_ids.
create function public.agent_goal_notes(
  secret text, goal_id uuid, kind text default null, body text default null, url text default null,
  resolve_ids uuid[] default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  new_id uuid;
  n integer := 0;
begin
  if not exists (select 1 from public.goals g where g.id = agent_goal_notes.goal_id and g.user_id = uid) then
    raise exception 'no such goal' using errcode = 'P0002';
  end if;
  if body is not null then
    if kind not in ('note', 'source', 'question') then
      raise exception 'kind must be note, source or question' using errcode = '22023';
    end if;
    insert into public.goal_notes (user_id, goal_id, kind, body, url, source)
      values (uid, agent_goal_notes.goal_id, kind, trim(body), nullif(url, ''), 'claude')
      returning id into new_id;
  end if;
  if resolve_ids is not null then
    update public.goal_notes x set resolved = true
      where x.goal_id = agent_goal_notes.goal_id and x.id = any (resolve_ids) and x.kind in ('question', 'answer');
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('id', new_id, 'resolved', n);
end;
$$;

-- Time you put in outside planned blocks ("spent 2 hours on the statement"),
-- recorded as a block that just ended; done = true also closes the task.
create function public.agent_log_progress(secret text, task_id uuid, minutes integer default null, done boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  t public.tasks;
begin
  select * into t from public.tasks x where x.id = agent_log_progress.task_id and x.user_id = uid;
  if not found then
    raise exception 'no such task' using errcode = 'P0002';
  end if;
  if minutes is not null then
    if minutes not between 5 and 240 then
      raise exception 'minutes must be between 5 and 240' using errcode = '22023';
    end if;
    -- Recorded as a kept block that has just ended, so it counts as time spent.
    insert into public.work_blocks (user_id, task_id, starts_at, ends_at, status, source, note)
      values (uid, t.id, now() - make_interval(mins => minutes), now(), 'planned', 'claude', 'Logged');
  end if;
  if done then
    update public.tasks x set status = 'done', completed_at = now() where x.id = t.id;
    update public.work_blocks b set status = 'withdrawn'
      where b.task_id = t.id and b.status in ('tentative', 'planned') and b.starts_at > now();
  end if;
  perform private.log_activity(uid,
    'Logged ' || coalesce(minutes || ' min on ', '') || t.title || case when done then ' (done)' else '' end,
    jsonb_build_object('task_id', t.id));
  return jsonb_build_object('task_id', t.id, 'logged_minutes', coalesce(minutes, 0), 'done', done);
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
    'public.agent_goal_context(text)',
    'public.agent_save_goal_plan(text, jsonb)',
    'public.agent_update_milestone(text, uuid, text, date, text, text, boolean)',
    'public.agent_goal_notes(text, uuid, text, text, text, uuid[])',
    'public.agent_log_progress(text, uuid, integer, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop;
end;
$$;
