-- One row per symbol for page reads, and one row per Tehran day for charts.

create table public.price_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_type public.asset_type not null,
  symbol text not null,
  day date not null,
  price numeric not null,
  source text not null,
  quoted_at timestamptz not null,
  primary key (user_id, asset_type, symbol, day),
  constraint price_days_symbol_not_blank check (char_length(btrim(symbol)) between 1 and 32),
  constraint price_days_price_positive check (price > 0),
  constraint price_days_source_length check (char_length(btrim(source)) between 1 and 80)
);

insert into public.price_days (user_id, asset_type, symbol, day, price, source, quoted_at)
select distinct on (user_id, asset_type, symbol, (timestamp at time zone 'Asia/Tehran')::date)
  user_id,
  asset_type,
  symbol,
  (timestamp at time zone 'Asia/Tehran')::date,
  price,
  source,
  timestamp
from public.prices
where price > 0
order by user_id, asset_type, symbol, (timestamp at time zone 'Asia/Tehran')::date, timestamp desc;

create or replace function private.keep_price_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price <= 0 then
    return new;
  end if;

  insert into public.price_days (user_id, asset_type, symbol, day, price, source, quoted_at)
  values (
    new.user_id,
    new.asset_type,
    new.symbol,
    (new.timestamp at time zone 'Asia/Tehran')::date,
    new.price,
    new.source,
    new.timestamp
  )
  on conflict (user_id, asset_type, symbol, day)
  do update set
    price = excluded.price,
    source = excluded.source,
    quoted_at = excluded.quoted_at
  where excluded.quoted_at >= public.price_days.quoted_at;

  return new;
end;
$$;

revoke all on function private.keep_price_day() from public, anon, authenticated;

create trigger prices_keep_day
  after insert on public.prices
  for each row execute function private.keep_price_day();

alter table public.price_days enable row level security;
alter table public.price_days force row level security;

create policy price_days_owner_select on public.price_days
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on table public.price_days to authenticated, service_role;

create view public.latest_prices
with (security_invoker = true) as
select distinct on (user_id, asset_type, symbol)
  id,
  user_id,
  asset_type,
  symbol,
  price,
  source,
  timestamp
from public.prices
order by user_id, asset_type, symbol, timestamp desc;

grant select on public.latest_prices to authenticated, service_role;
