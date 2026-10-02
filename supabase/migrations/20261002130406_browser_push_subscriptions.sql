-- Browser push subscriptions for alert delivery.
-- A failed push leaves alerts.sent false so a later run can retry.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) between 12 and 2000),
  constraint push_subscriptions_key_length check (
    char_length(p256dh) between 1 and 200
    and char_length(auth) between 1 and 200
  ),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%')
);

create unique index push_subscriptions_user_endpoint_idx
  on public.push_subscriptions (user_id, endpoint);

comment on table public.push_subscriptions is
  'Web Push endpoints for this owner. One row per browser.';

create trigger push_subscriptions_stamp_owner
  before insert or update on public.push_subscriptions
  for each row execute function private.stamp_owner();

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

create policy push_subscriptions_owner on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.push_subscriptions from public, anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
