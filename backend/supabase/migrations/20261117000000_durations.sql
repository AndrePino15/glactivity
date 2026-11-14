-- Stage (d): learning how long things take. After a study block you answer
-- with one tap (done, needed more, didn't do it); the assistant compares the
-- time really spent with the first estimate, learns your ratios and best
-- times, and estimates and plans better. See docs/claude-agent.md.

alter table public.work_blocks
  add column outcome text check (outcome in ('done', 'more', 'missed')),
  -- "Needed more": how much more the task still needs.
  add column extra_minutes integer check (extra_minutes between 0 and 600),
  add column answered_at timestamptz;

-- The estimate as first given, so later top-ups don't hide how far off it was.
alter table public.tasks add column first_estimate_minutes integer check (first_estimate_minutes between 0 and 6000);
update public.tasks set first_estimate_minutes = estimate_minutes where first_estimate_minutes is null;

create function private.keep_first_estimate() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.first_estimate_minutes is null and new.estimate_minutes is not null then
    new.first_estimate_minutes := new.estimate_minutes;
  end if;
  return new;
end;
$$;
revoke execute on function private.keep_first_estimate() from public, anon, authenticated;

create trigger tasks_first_estimate before insert or update of estimate_minutes on public.tasks
  for each row execute function private.keep_first_estimate();

-- Your answer for a block that has ended. Done and needed more keep it as time
-- spent (a pencilled-in block you did anyway becomes planned); needed more
-- also adds to the task's estimate; didn't do it leaves it out of time spent,
-- so the planner finds new time. Runs as you, so row level security applies.
create function public.answer_block(block_id uuid, outcome text, extra_minutes integer default null) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  b public.work_blocks;
begin
  if outcome not in ('done', 'more', 'missed') then
    raise exception 'outcome must be done, more or missed' using errcode = '22023';
  end if;
  select * into b from public.work_blocks x where x.id = block_id for update;
  if not found then
    raise exception 'no such block' using errcode = 'P0002';
  end if;
  if b.ends_at > now() + interval '5 minutes' then
    raise exception 'that block hasn''t finished yet' using errcode = '22023';
  end if;
  update public.work_blocks x set
    outcome = answer_block.outcome,
    extra_minutes = case when answer_block.outcome = 'more' then answer_block.extra_minutes end,
    answered_at = now(),
    status = case when answer_block.outcome in ('done', 'more') and x.status = 'tentative' then 'planned' else x.status end
  where x.id = b.id;
  if outcome = 'more' and coalesce(extra_minutes, 0) > 0 then
    update public.tasks t set estimate_minutes = least(coalesce(t.estimate_minutes, 0) + extra_minutes, 6000)
      where t.id = b.task_id;
  end if;
  insert into public.agent_activity (actor, summary, detail)
    values ('you',
            (select case answer_block.outcome when 'done' then 'Did: ' when 'more' then 'Needs more time: ' else 'Didn’t get to: ' end || t.title
             from public.tasks t where t.id = b.task_id),
            jsonb_build_object('block_id', b.id));
end;
$$;
revoke execute on function public.answer_block(uuid, text, integer) from public, anon;
grant execute on function public.answer_block(uuid, text, integer) to authenticated;

-- Time spent no longer counts blocks you didn't do.
create or replace function public.agent_plan_context(secret text, days_ahead integer default 14) returns jsonb
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
        'completed_at', t.completed_at, 'first_estimate_minutes', t.first_estimate_minutes,
        -- Planned time that has already passed (until blocks record what really happened).
        'spent_minutes', coalesce((
          select sum(extract(epoch from (least(b.ends_at, now()) - b.starts_at)) / 60)::integer
          from public.work_blocks b
          where b.task_id = t.id and b.status = 'planned' and b.outcome is distinct from 'missed' and b.starts_at < now()
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
        'status', b.status, 'source', b.source, 'outcome', b.outcome, 'extra_minutes', b.extra_minutes
      ) order by b.starts_at)
      from public.work_blocks b join public.tasks t on t.id = b.task_id
      where b.user_id = uid and b.status <> 'withdrawn'
        and b.ends_at > ((today - 7)::timestamp at time zone tz)
        and b.starts_at < ((to_day + 1)::timestamp at time zone tz)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.agent_goal_context(secret text) returns jsonb
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
                  from public.work_blocks b
          where b.task_id = t.id and b.status = 'planned' and b.outcome is distinct from 'missed' and b.starts_at < now()
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

-- What the assistant learns from: recent blocks with how they went, and
-- finished tasks with their first estimate against the time really spent.
create function public.agent_duration_stats(secret text, days integer default 56) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  tz text := coalesce((select p.timezone from public.profiles p where p.id = uid), 'Europe/London');
  since timestamptz := now() - make_interval(days => least(greatest(coalesce(days, 56), 7), 180));
begin
  return jsonb_build_object(
    'timezone', tz,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'task', t.title, 'subject', t.subject, 'starts_at', b.starts_at,
        'local_hour', extract(hour from b.starts_at at time zone tz)::integer,
        'weekday', to_char(b.starts_at at time zone tz, 'Dy'),
        'minutes', (extract(epoch from (b.ends_at - b.starts_at)) / 60)::integer,
        'status', b.status, 'source', b.source, 'outcome', b.outcome, 'extra_minutes', b.extra_minutes
      ) order by b.starts_at)
      from public.work_blocks b join public.tasks t on t.id = b.task_id
      where b.user_id = uid and b.starts_at >= since and b.ends_at <= now() and b.status <> 'withdrawn'
    ), '[]'::jsonb),
    'finished_tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', t.title, 'subject', t.subject, 'first_estimate_minutes', t.first_estimate_minutes,
        'final_estimate_minutes', t.estimate_minutes,
        'actual_minutes', coalesce((
          select sum(extract(epoch from (b.ends_at - b.starts_at)) / 60)::integer
          from public.work_blocks b
          where b.task_id = t.id and b.status = 'planned' and b.outcome is distinct from 'missed' and b.starts_at < now()
        ), 0),
        'completed_at', t.completed_at
      ) order by t.completed_at)
      from public.tasks t
      where t.user_id = uid and t.status = 'done' and t.completed_at >= since
    ), '[]'::jsonb)
  );
end;
$$;

-- For chats: "I didn't do my essay block this morning".
create function public.agent_record_outcome(secret text, block_id uuid, outcome text, extra_minutes integer default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.agent_owner(secret);
  b public.work_blocks;
  title text;
begin
  if outcome not in ('done', 'more', 'missed') then
    raise exception 'outcome must be done, more or missed' using errcode = '22023';
  end if;
  select * into b from public.work_blocks x where x.id = agent_record_outcome.block_id and x.user_id = uid;
  if not found then
    raise exception 'no such block' using errcode = 'P0002';
  end if;
  if b.ends_at > now() + interval '5 minutes' then
    raise exception 'that block hasn''t finished yet' using errcode = '22023';
  end if;
  update public.work_blocks x set
    outcome = agent_record_outcome.outcome,
    extra_minutes = case when agent_record_outcome.outcome = 'more' then agent_record_outcome.extra_minutes end,
    answered_at = now(),
    status = case when agent_record_outcome.outcome in ('done', 'more') and x.status = 'tentative' then 'planned' else x.status end
  where x.id = b.id;
  if outcome = 'more' and coalesce(extra_minutes, 0) > 0 then
    update public.tasks t set estimate_minutes = least(coalesce(t.estimate_minutes, 0) + extra_minutes, 6000) where t.id = b.task_id;
  end if;
  select t.title into title from public.tasks t where t.id = b.task_id;
  perform private.log_activity(uid,
    case outcome when 'done' then 'Recorded as done: ' when 'more' then 'Needs more time: ' else 'Recorded as missed: ' end || title,
    jsonb_build_object('block_id', b.id));
  return jsonb_build_object('block_id', b.id, 'outcome', outcome);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.agent_duration_stats(text, integer)', 'public.agent_record_outcome(text, uuid, text, integer)'] loop
    execute format('revoke execute on function %s from public, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop;
end;
$$;
