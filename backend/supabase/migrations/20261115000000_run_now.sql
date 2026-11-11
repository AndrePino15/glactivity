-- Stage (e): "Run now". The assistant's scheduled check (a Claude scheduled
-- task on the owner's subscription) has an API trigger; its URL and token are
-- kept here so the app can start a check on demand. See docs/claude-agent.md.

create table private.run_now (
  user_id uuid primary key references auth.users on delete cascade,
  -- Only Anthropic's trigger endpoint, so the token can't be sent anywhere else.
  fire_url text not null check (fire_url ~ '^https://api\.anthropic\.com/v1/claude_code/routines/[A-Za-z0-9_-]+/fire$'),
  token text not null check (length(token) between 20 and 500 and token !~ '\s'),
  last_fired_at timestamptz,
  created_at timestamptz not null default now()
);

-- Saves (or replaces) your trigger URL and token.
create function public.set_run_now(fire_url text, token text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into private.run_now (user_id, fire_url, token) values (uid, trim(fire_url), trim(token))
    on conflict (user_id) do update set fire_url = excluded.fire_url, token = excluded.token, last_fired_at = null, created_at = now();
  insert into public.agent_activity (user_id, actor, summary) values (uid, 'you', 'Connected Run now');
end;
$$;

create function public.clear_run_now() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  delete from private.run_now where user_id = uid;
  if found then
    insert into public.agent_activity (user_id, actor, summary) values (uid, 'you', 'Disconnected Run now');
  end if;
end;
$$;

-- Whether Run now is set up, without the token.
create function public.run_now_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'connected', exists (select 1 from private.run_now r where r.user_id = (select auth.uid())),
    'last_fired_at', (select r.last_fired_at from private.run_now r where r.user_id = (select auth.uid()))
  );
$$;

-- For the app's server: the URL and token to start a check, at most once
-- every two minutes. Returns {wait_seconds} when it's too soon, null when
-- Run now isn't set up.
create function public.claim_run_now() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r private.run_now;
begin
  select * into r from private.run_now x where x.user_id = uid for update;
  if not found then
    return null;
  end if;
  if r.last_fired_at > now() - interval '2 minutes' then
    return jsonb_build_object('wait_seconds', ceil(extract(epoch from (r.last_fired_at + interval '2 minutes' - now())))::integer);
  end if;
  update private.run_now x set last_fired_at = now() where x.user_id = uid;
  insert into public.agent_activity (user_id, actor, summary) values (uid, 'you', 'Started a check (Run now)');
  return jsonb_build_object('fire_url', r.fire_url, 'token', r.token);
end;
$$;

-- When the start didn't go through, so you can try again straight away.
create function public.release_run_now(reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  update private.run_now x set last_fired_at = null where x.user_id = uid;
  insert into public.agent_activity (user_id, actor, summary)
    values (uid, 'you', left('Run now didn’t start: ' || coalesce(reason, 'unknown error'), 500));
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.set_run_now(text, text)',
    'public.clear_run_now()',
    'public.run_now_status()',
    'public.claim_run_now()',
    'public.release_run_now(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
