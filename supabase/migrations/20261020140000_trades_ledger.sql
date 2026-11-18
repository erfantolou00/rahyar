-- Trades are the only writer of quantity and average buy for stocks and funds.
-- Opening balances are one buy each and do not move cash.
-- Deleting an asset keeps the trade rows and clears their asset link.

create type public.trade_side as enum ('buy', 'sell');

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete set null,
  asset_type public.asset_type not null,
  symbol text not null,
  side public.trade_side not null,
  quantity numeric not null,
  price numeric,
  fee numeric not null default 0,
  price_unit text not null default 'rial',
  traded_on date not null,
  settles_cash boolean not null default true,
  cash_asset_id uuid references public.assets (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint trades_quantity_positive check (quantity > 0),
  constraint trades_price_nonnegative check (price is null or price >= 0),
  constraint trades_fee_nonnegative check (fee >= 0),
  constraint trades_symbol_not_blank check (char_length(btrim(symbol)) between 1 and 32),
  constraint trades_price_unit_check check (price_unit in ('rial', 'usd'))
);

create index trades_asset_day_idx on public.trades (asset_id, traded_on);
create index trades_user_day_idx on public.trades (user_id, traded_on desc);

create or replace function private.blank_listed_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type in ('stock', 'fund') then
    new.quantity := 0;
    new.avg_buy_price := null;
    new.acquired_on := null;
  end if;
  return new;
end;
$$;

create trigger assets_05_blank_listed_position
  before insert on public.assets
  for each row execute function private.blank_listed_position();

create or replace function private.keep_listed_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type in ('stock', 'fund')
    and coalesce(current_setting('rahyar.sync_position', true), '') is distinct from 'on' then
    new.quantity := old.quantity;
    new.avg_buy_price := old.avg_buy_price;
    new.acquired_on := old.acquired_on;
    new.price_unit := old.price_unit;
    new.type := old.type;
  end if;
  return new;
end;
$$;

create trigger assets_06_keep_listed_position
  before update on public.assets
  for each row execute function private.keep_listed_position();

create or replace function private.prepare_trade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  unit text;
  held numeric;
  cash_id uuid;
  cash_qty numeric;
  delta numeric;
begin
  select user_id, price_unit, quantity
    into owner, unit, held
  from public.assets
  where id = new.asset_id;

  if owner is null or owner <> new.user_id then
    raise exception 'trade asset owner' using errcode = '42501';
  end if;

  if new.side = 'sell' and (held is null or new.quantity > held) then
    raise exception 'oversell' using errcode = '23514';
  end if;

  if new.settles_cash and new.price is not null and unit = 'rial' and new.price_unit = 'rial' then
    select id, quantity
      into cash_id, cash_qty
    from public.assets
    where user_id = new.user_id
      and type = 'cash'
      and price_unit = 'rial'
      and id <> new.asset_id
    order by created_at
    limit 1;

    if cash_id is not null then
      delta := case
        when new.side = 'buy' then -(new.quantity * new.price + new.fee)
        else (new.quantity * new.price - new.fee)
      end;
      if cash_qty + delta >= 0 then
        update public.assets
        set quantity = quantity + delta
        where id = cash_id;
        new.cash_asset_id := cash_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.sync_listed_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  held numeric := 0;
  cost numeric := 0;
  known boolean := true;
  average numeric := null;
  first_day date := null;
  row record;
begin
  if tg_op = 'UPDATE' and new.asset_id is null and old.asset_id is not null then
    return null;
  end if;

  target := coalesce(new.asset_id, old.asset_id);
  if target is null then
    return null;
  end if;

  for row in
    select side, quantity, price, fee, traded_on
    from public.trades
    where asset_id = target
    order by traded_on, created_at
  loop
    if row.side = 'buy' then
      if row.price is null then
        known := false;
      end if;
      if known and row.price is not null then
        cost := cost + row.quantity * row.price + row.fee;
      end if;
      held := held + row.quantity;
      if first_day is null or row.traded_on < first_day then
        first_day := row.traded_on;
      end if;
    else
      if row.quantity > held then
        raise exception 'oversell' using errcode = '23514';
      end if;
      if known and held > 0 then
        cost := cost - (cost / held) * row.quantity;
      end if;
      held := held - row.quantity;
      if held <= 0 then
        held := 0;
        cost := 0;
        known := true;
      end if;
    end if;
  end loop;

  if held > 0 and known then
    average := cost / held;
  else
    average := null;
    if held <= 0 then
      first_day := null;
    end if;
  end if;

  perform set_config('rahyar.sync_position', 'on', true);
  update public.assets
  set quantity = held,
      avg_buy_price = average,
      acquired_on = first_day
  where id = target
    and type in ('stock', 'fund');

  return null;
end;
$$;

create trigger trades_00_stamp_owner
  before insert or update on public.trades
  for each row execute function private.stamp_owner();

create trigger trades_10_prepare
  before insert on public.trades
  for each row execute function private.prepare_trade();

create trigger trades_20_sync_position
  after insert or update or delete on public.trades
  for each row execute function private.sync_listed_position();

insert into public.trades (
  user_id, asset_id, asset_type, symbol, side, quantity, price, fee, price_unit, traded_on, settles_cash
)
select
  user_id,
  id,
  type,
  symbol,
  'buy',
  quantity,
  avg_buy_price,
  0,
  price_unit,
  coalesce(acquired_on, (created_at at time zone 'Asia/Tehran')::date),
  false
from public.assets
where type in ('stock', 'fund')
  and quantity > 0;

alter table public.trades enable row level security;
alter table public.trades force row level security;

create policy trades_owner on public.trades
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.trades from public, anon;
grant select, insert, update, delete on table public.trades to authenticated;
grant select, insert, update, delete on table public.trades to service_role;

revoke all on function private.blank_listed_position() from public, anon, authenticated;
revoke all on function private.keep_listed_position() from public, anon, authenticated;
revoke all on function private.prepare_trade() from public, anon, authenticated;
revoke all on function private.sync_listed_position() from public, anon, authenticated;

drop trigger if exists transactions_00_stamp_owner on public.transactions;
drop trigger if exists transactions_10_enforce_asset_owner on public.transactions;
drop function if exists private.enforce_transaction_asset_owner();
drop table if exists public.transactions;
drop type if exists public.transaction_type;
