-- Telegram delivery for new alert rows.
-- sent stays false until Telegram accepts the message, so a later run can retry.
-- Existing rows are marked sent so historical rules are not pushed to the chat.

alter table public.alerts
  add column sent boolean not null default false,
  add column sent_at timestamptz;

update public.alerts
   set sent = true,
       sent_at = pg_catalog.now()
 where sent = false;

alter table public.alerts
  add constraint alerts_sent_pair check (
    (sent and sent_at is not null)
    or ((not sent) and sent_at is null)
  );

comment on column public.alerts.sent is
  'True only after Telegram accepts the message. False means not sent yet, including a failed attempt.';

create index alerts_unsent_idx
  on public.alerts (user_id)
  where sent = false and is_active;

create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_telegram_chat_id_shape check (
    telegram_chat_id is null
    or telegram_chat_id ~ '^-?[0-9]{1,20}$'
  )
);

comment on table public.settings is
  'Per-user preferences. telegram_chat_id can be filled once and then is immutable.';
comment on column public.settings.telegram_chat_id is
  'Telegram chat id. Null until the owner sets it. Updates that change a non-null value are rejected.';

create table public.alert_frequencies (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  frequency text not null,
  last_sent_at timestamptz,
  primary key (user_id, kind),
  constraint alert_frequencies_kind_check
    check (kind in ('rule', 'allocation_deviation')),
  constraint alert_frequencies_frequency_check
    check (frequency in ('immediate', 'daily', 'weekly', 'off'))
);

comment on table public.alert_frequencies is
  'How often each alert kind may be pushed to Telegram. Missing row means immediate.';
comment on column public.alert_frequencies.last_sent_at is
  'Last successful Telegram delivery for this kind. Failed attempts do not stamp it.';

create or replace function private.protect_telegram_chat_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.telegram_chat_id is not null
     and new.telegram_chat_id is distinct from old.telegram_chat_id
  then
    raise exception 'telegram_chat_id can be set only once'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_telegram_chat_id() from public, anon, authenticated;
grant execute on function private.protect_telegram_chat_id() to authenticated;

create trigger settings_00_stamp_owner
  before insert or update on public.settings
  for each row execute function private.stamp_owner();

create trigger settings_10_protect_telegram_chat_id
  before update on public.settings
  for each row execute function private.protect_telegram_chat_id();

create trigger settings_20_touch_updated_at
  before update on public.settings
  for each row execute function private.touch_updated_at();

create trigger alert_frequencies_stamp_owner
  before insert or update on public.alert_frequencies
  for each row execute function private.stamp_owner();

alter table public.settings enable row level security;
alter table public.settings force row level security;
alter table public.alert_frequencies enable row level security;
alter table public.alert_frequencies force row level security;

create policy settings_owner on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy alert_frequencies_owner on public.alert_frequencies
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.settings from public, anon;
revoke all on table public.alert_frequencies from public, anon;

grant select, insert, update on table public.settings to authenticated;
grant select, insert, update on table public.alert_frequencies to authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant usage on schema private to service_role;
    grant execute on function private.stamp_owner() to service_role;
    grant execute on function private.touch_updated_at() to service_role;
    grant execute on function private.protect_telegram_chat_id() to service_role;
    grant select, update on table public.alerts to service_role;
    grant select on table public.settings to service_role;
    grant select, insert, update on table public.alert_frequencies to service_role;
  end if;
end;
$$;
