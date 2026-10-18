-- Smart Calendar V1 schema.
-- Every table carries user_id and has row-level security, so a signed-in user
-- can only ever read or write their own rows, even if app code has a bug.

create type session_status as enum ('planned', 'done', 'skipped', 'missed');
create type checkin_outcome as enum ('done', 'skipped');
create type secret_kind as enum ('anthropic_api_key', 'google_refresh_token');

create table tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#4f46e5',
  weekly_minutes_target int not null default 300 check (weekly_minutes_target between 0 and 10080),
  created_at timestamptz not null default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  track_id uuid not null references tracks on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  wants_roadmap boolean not null default true,
  -- What the user already knows: pasted course list, self-description, etc.
  prior_knowledge text check (char_length(prior_knowledge) <= 8000),
  placement_quiz jsonb,
  placement_answers jsonb,
  session_minutes int not null default 60 check (session_minutes between 15 and 240),
  created_at timestamptz not null default now()
);

create table roadmap_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references goals on delete cascade,
  position int not null,
  title text not null,
  summary text not null,
  objectives jsonb not null default '[]',
  resources jsonb not null default '[]',
  estimated_sessions int not null check (estimated_sessions > 0),
  skipped_as_known boolean not null default false,
  unique (goal_id, position)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references goals on delete cascade,
  module_id uuid references roadmap_modules on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status session_status not null default 'planned',
  -- Set on a replacement session created for a missed one.
  rescheduled_from uuid references sessions on delete set null,
  created_at timestamptz not null default now()
);
create index sessions_user_time on sessions (user_id, starts_at);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  session_id uuid not null references sessions on delete cascade,
  outcome checkin_outcome not null,
  reason text check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);

alter table tracks enable row level security;
alter table goals enable row level security;
alter table roadmap_modules enable row level security;
alter table sessions enable row level security;
alter table checkins enable row level security;

create policy "own rows" on tracks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on goals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on roadmap_modules for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on checkins for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Secrets (the user's Claude API key and Google refresh token) live encrypted in
-- Supabase Vault. This table only points at them and keeps the last 4 characters
-- for display. RLS is on with no policies, so browsers can never read it; only
-- the server, using the service role key, goes through the functions below.
create table user_secrets (
  user_id uuid not null references auth.users on delete cascade,
  kind secret_kind not null,
  vault_secret_id uuid not null,
  last4 text,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table user_secrets enable row level security;

create or replace function public.set_user_secret(p_user_id uuid, p_kind secret_kind, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  select vault_secret_id into existing
    from public.user_secrets where user_id = p_user_id and kind = p_kind;

  if existing is null then
    insert into public.user_secrets (user_id, kind, vault_secret_id, last4)
    values (p_user_id, p_kind, vault.create_secret(p_value), right(p_value, 4));
  else
    perform vault.update_secret(existing, p_value);
    update public.user_secrets
      set last4 = right(p_value, 4), updated_at = now()
      where user_id = p_user_id and kind = p_kind;
  end if;
end;
$$;

create or replace function public.get_user_secret(p_user_id uuid, p_kind secret_kind)
returns text
language sql
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
    from public.user_secrets us
    join vault.decrypted_secrets ds on ds.id = us.vault_secret_id
    where us.user_id = p_user_id and us.kind = p_kind;
$$;

create or replace function public.delete_user_secret(p_user_id uuid, p_kind secret_kind)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  delete from public.user_secrets
    where user_id = p_user_id and kind = p_kind
    returning vault_secret_id into existing;
  if existing is not null then
    delete from vault.secrets where id = existing;
  end if;
end;
$$;

revoke all on function public.set_user_secret(uuid, secret_kind, text) from public, anon, authenticated;
revoke all on function public.get_user_secret(uuid, secret_kind) from public, anon, authenticated;
revoke all on function public.delete_user_secret(uuid, secret_kind) from public, anon, authenticated;
grant execute on function public.set_user_secret(uuid, secret_kind, text) to service_role;
grant execute on function public.get_user_secret(uuid, secret_kind) to service_role;
grant execute on function public.delete_user_secret(uuid, secret_kind) to service_role;
