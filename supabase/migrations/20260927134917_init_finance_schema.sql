-- Rahyar initial schema.
-- Every table is owned by auth.users.id. RLS lets that owner read and write only their rows.
-- Allocations are versioned: old rows stay, valid_to is filled, and a new row is inserted.
--
-- Apply on the hosted project either by pasting this file into the SQL editor,
-- or with: npx supabase link --project-ref <ref> && npx supabase db push

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

comment on schema private is
  'Helper functions for triggers. Not part of the Data API.';

create type public.asset_type as enum (
  'stock',
  'gold',
  'coin',
  'crypto',
  'cash',
  'fund',
  'loan',
  'real_estate'
);

create type public.transaction_type as enum (
  'buy',
  'sell',
  'deposit',
  'withdraw'
);

create type public.report_type as enum (
  'daily',
  'weekly',
  'event',
  'period'
);

create type public.chat_role as enum (
  'user',
  'assistant',
  'system'
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.asset_type not null,
  symbol text not null,
  quantity numeric not null default 0,
  avg_buy_price numeric,
  target_min_weight numeric,
  target_max_weight numeric,
  risk_level smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_symbol_not_blank check (char_length(btrim(symbol)) between 1 and 32),
  constraint assets_quantity_nonnegative check (quantity >= 0),
  constraint assets_avg_buy_price_nonnegative check (avg_buy_price is null or avg_buy_price >= 0),
  constraint assets_risk_level_range check (risk_level is null or risk_level between 1 and 5),
  constraint assets_weight_range check (
    (target_min_weight is null or (target_min_weight >= 0 and target_min_weight <= 100))
    and (target_max_weight is null or (target_max_weight >= 0 and target_max_weight <= 100))
    and (
      target_min_weight is null
      or target_max_weight is null
      or target_min_weight <= target_max_weight
    )
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  type public.transaction_type not null,
  qty numeric not null,
  price numeric not null,
  date date not null,
  note text,
  constraint transactions_qty_positive check (qty > 0),
  constraint transactions_price_nonnegative check (price >= 0),
  constraint transactions_note_length check (note is null or char_length(note) <= 500)
);

create table public.prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_type public.asset_type not null,
  symbol text not null,
  price numeric not null,
  source text not null,
  timestamp timestamptz not null default now(),
  constraint prices_symbol_not_blank check (char_length(btrim(symbol)) between 1 and 32),
  constraint prices_price_nonnegative check (price >= 0),
  constraint prices_source_length check (char_length(btrim(source)) between 1 and 80)
);

create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_type public.asset_type not null,
  min_percent numeric not null,
  max_percent numeric not null,
  formula_version text not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  constraint allocations_percent_range check (
    min_percent >= 0
    and max_percent <= 100
    and min_percent <= max_percent
  ),
  constraint allocations_formula_version_length check (char_length(btrim(formula_version)) between 1 and 40),
  constraint allocations_valid_window check (valid_to is null or valid_to >= valid_from)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule text not null,
  threshold numeric not null,
  channel text not null,
  is_active boolean not null default true,
  frequency text not null,
  constraint alerts_rule_length check (char_length(btrim(rule)) between 1 and 200),
  constraint alerts_channel_length check (char_length(btrim(channel)) between 1 and 40),
  constraint alerts_frequency_length check (char_length(btrim(frequency)) between 1 and 40)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.report_type not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create table public.chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.chat_role not null,
  message text not null,
  context jsonb,
  timestamp timestamptz not null default now(),
  constraint chat_logs_message_length check (char_length(btrim(message)) between 1 and 4000)
);

create index assets_user_id_idx on public.assets (user_id);
create index assets_user_symbol_idx on public.assets (user_id, symbol);
create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_asset_id_idx on public.transactions (asset_id);
create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index prices_lookup_idx on public.prices (user_id, asset_type, symbol, timestamp desc);
create index allocations_user_id_idx on public.allocations (user_id, asset_type, valid_from desc);
create unique index allocations_one_open_per_type_idx
  on public.allocations (user_id, asset_type)
  where valid_to is null;
create index alerts_user_id_idx on public.alerts (user_id);
create index alerts_active_idx on public.alerts (user_id) where is_active;
create index reports_user_created_idx on public.reports (user_id, created_at desc);
create index chat_logs_user_timestamp_idx on public.chat_logs (user_id, timestamp desc);

create or replace function private.stamp_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.user_id := auth.uid();
    else
      new.user_id := old.user_id;
    end if;
  end if;

  if new.user_id is null then
    raise exception 'user_id is required' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.protect_closed_allocation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.valid_to is not null then
    raise exception 'closed allocations are immutable' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.asset_type is distinct from old.asset_type
    or new.min_percent is distinct from old.min_percent
    or new.max_percent is distinct from old.max_percent
    or new.formula_version is distinct from old.formula_version
    or new.valid_from is distinct from old.valid_from
  then
    raise exception 'close the current allocation and insert a new version'
      using errcode = '42501';
  end if;

  if new.valid_to is null then
    raise exception 'an allocation update must set valid_to' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.prevent_allocation_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'allocations are versioned and cannot be deleted; set valid_to instead'
    using errcode = '42501';
end;
$$;

create or replace function private.enforce_transaction_asset_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.assets
    where id = new.asset_id
      and user_id = new.user_id
  ) then
    raise exception 'asset does not belong to this user' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_single_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(824651);

  if (select count(*) from auth.users) > 1 then
    raise exception 'single-user mode: additional accounts are not allowed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.stamp_owner() from public, anon, authenticated;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.protect_closed_allocation() from public, anon, authenticated;
revoke all on function private.prevent_allocation_delete() from public, anon, authenticated;
revoke all on function private.enforce_transaction_asset_owner() from public, anon, authenticated;
revoke all on function private.enforce_single_user() from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.stamp_owner() to authenticated;
grant execute on function private.touch_updated_at() to authenticated;
grant execute on function private.protect_closed_allocation() to authenticated;
grant execute on function private.prevent_allocation_delete() to authenticated;
grant execute on function private.enforce_transaction_asset_owner() to authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function private.enforce_single_user() to supabase_auth_admin;
  end if;
end;
$$;

create trigger assets_00_stamp_owner
  before insert or update on public.assets
  for each row execute function private.stamp_owner();

create trigger assets_10_touch_updated_at
  before update on public.assets
  for each row execute function private.touch_updated_at();

create trigger transactions_00_stamp_owner
  before insert or update on public.transactions
  for each row execute function private.stamp_owner();

create trigger transactions_10_enforce_asset_owner
  before insert or update on public.transactions
  for each row execute function private.enforce_transaction_asset_owner();

create trigger prices_stamp_owner
  before insert or update on public.prices
  for each row execute function private.stamp_owner();

create trigger allocations_00_stamp_owner
  before insert or update on public.allocations
  for each row execute function private.stamp_owner();

create trigger allocations_10_protect_closed
  before update on public.allocations
  for each row execute function private.protect_closed_allocation();

create trigger allocations_prevent_delete
  before delete on public.allocations
  for each row execute function private.prevent_allocation_delete();

create trigger alerts_stamp_owner
  before insert or update on public.alerts
  for each row execute function private.stamp_owner();

create trigger reports_stamp_owner
  before insert or update on public.reports
  for each row execute function private.stamp_owner();

create trigger chat_logs_stamp_owner
  before insert or update on public.chat_logs
  for each row execute function private.stamp_owner();

create trigger enforce_single_user
  after insert on auth.users
  for each row execute function private.enforce_single_user();

create or replace function public.replace_allocation(
  p_asset_type public.asset_type,
  p_min_percent numeric,
  p_max_percent numeric,
  p_formula_version text
)
returns public.allocations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted public.allocations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_min_percent < 0
    or p_max_percent > 100
    or p_min_percent > p_max_percent
    or char_length(btrim(p_formula_version)) < 1
    or char_length(btrim(p_formula_version)) > 40
  then
    raise exception 'invalid allocation' using errcode = '22023';
  end if;

  update public.allocations
     set valid_to = pg_catalog.now()
   where user_id = auth.uid()
     and asset_type = p_asset_type
     and valid_to is null;

  insert into public.allocations (
    user_id,
    asset_type,
    min_percent,
    max_percent,
    formula_version,
    valid_from
  )
  values (
    auth.uid(),
    p_asset_type,
    p_min_percent,
    p_max_percent,
    btrim(p_formula_version),
    pg_catalog.now()
  )
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.replace_allocation(public.asset_type, numeric, numeric, text)
  from public, anon;
grant execute on function public.replace_allocation(public.asset_type, numeric, numeric, text)
  to authenticated;

alter table public.assets enable row level security;
alter table public.assets force row level security;
alter table public.transactions enable row level security;
alter table public.transactions force row level security;
alter table public.prices enable row level security;
alter table public.prices force row level security;
alter table public.allocations enable row level security;
alter table public.allocations force row level security;
alter table public.alerts enable row level security;
alter table public.alerts force row level security;
alter table public.reports enable row level security;
alter table public.reports force row level security;
alter table public.chat_logs enable row level security;
alter table public.chat_logs force row level security;

create policy assets_owner on public.assets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy transactions_owner on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy prices_owner on public.prices
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy allocations_owner_select on public.allocations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy allocations_owner_insert on public.allocations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy allocations_owner_update on public.allocations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy alerts_owner on public.alerts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy reports_owner on public.reports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy chat_logs_owner on public.chat_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.assets from public, anon;
revoke all on table public.transactions from public, anon;
revoke all on table public.prices from public, anon;
revoke all on table public.allocations from public, anon, authenticated;
revoke all on table public.alerts from public, anon;
revoke all on table public.reports from public, anon;
revoke all on table public.chat_logs from public, anon;

grant select, insert, update, delete on table public.assets to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.prices to authenticated;
grant select, insert, update on table public.allocations to authenticated;
grant select, insert, update, delete on table public.alerts to authenticated;
grant select, insert, update, delete on table public.reports to authenticated;
grant select, insert, update, delete on table public.chat_logs to authenticated;

comment on table public.allocations is
  'Versioned bands. Do not delete rows; close them by setting valid_to.';
comment on column public.assets.user_id is
  'Owner. Stamped from auth.uid() and enforced by row level security.';
