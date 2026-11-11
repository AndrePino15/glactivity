-- Phase 3: suggestions.

-- What you did with a suggestion: acted on it or waved it away. Hides it for
-- the day, and tells later suggestions what you care about.
create table public.suggestion_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  key text not null,
  response text not null check (response in ('done', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, day, key)
);

alter table public.suggestion_feedback enable row level security;

create policy "Own rows" on public.suggestion_feedback for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.suggestion_feedback to authenticated;
