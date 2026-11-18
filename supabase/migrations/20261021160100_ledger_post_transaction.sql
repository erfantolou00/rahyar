-- Account positions under one asset row.
-- post_transaction is the only writer of quantity and average buy price
-- for stock, fund, gold, coin, usd, crypto, and cash.

create type public.account_kind as enum ('brokerage', 'bullion', 'fx', 'wallet');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind public.account_kind not null,
  currency text not null,
  created_at timestamptz not null default now(),
  constraint accounts_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint accounts_currency_check check (currency in ('rial', 'usd')),
  unique (user_id, name)
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  asset_id uuid not null references public.assets (id) on delete restrict,
  quantity numeric not null default 0,
  avg_buy_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positions_quantity_nonnegative check (quantity >= 0),
  constraint positions_avg_nonnegative check (avg_buy_price is null or avg_buy_price >= 0),
  unique (account_id, asset_id)
);

create index positions_asset_idx on public.positions (asset_id);
create index positions_user_idx on public.positions (user_id);
create index accounts_user_idx on public.accounts (user_id);

do $$
begin
  if to_regclass('public.transactions') is null then
    create table public.transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      asset_id uuid not null references public.assets (id) on delete restrict,
      account_id uuid not null references public.accounts (id) on delete restrict,
      counter_account_id uuid references public.accounts (id) on delete restrict,
      cash_asset_id uuid references public.assets (id) on delete restrict,
      type public.transaction_type not null,
      qty numeric not null,
      price numeric,
      fee numeric not null default 0,
      price_unit text not null,
      fx_rate numeric,
      settles_cash boolean not null default false,
      origin text not null default 'manual',
      idempotency_key text,
      date date not null,
      note text,
      created_at timestamptz not null default now()
    );
  else
    alter table public.transactions
      add column if not exists account_id uuid references public.accounts (id) on delete restrict,
      add column if not exists counter_account_id uuid references public.accounts (id) on delete restrict,
      add column if not exists cash_asset_id uuid references public.assets (id) on delete restrict,
      add column if not exists fee numeric not null default 0,
      add column if not exists price_unit text,
      add column if not exists fx_rate numeric,
      add column if not exists settles_cash boolean not null default false,
      add column if not exists origin text not null default 'manual',
      add column if not exists idempotency_key text,
      add column if not exists created_at timestamptz not null default now();
  end if;
end
$$;

alter table public.transactions alter column price drop not null;

alter table public.transactions
  drop constraint if exists transactions_qty_positive,
  add constraint transactions_qty_positive check (qty > 0),
  drop constraint if exists transactions_price_nonnegative,
  add constraint transactions_price_nonnegative check (price is null or price >= 0),
  drop constraint if exists transactions_fee_nonnegative,
  add constraint transactions_fee_nonnegative check (fee >= 0),
  drop constraint if exists transactions_price_unit_check,
  add constraint transactions_price_unit_check check (price_unit in ('rial', 'usd')),
  drop constraint if exists transactions_fx_positive,
  add constraint transactions_fx_positive check (fx_rate is null or fx_rate > 0),
  drop constraint if exists transactions_origin_check,
  add constraint transactions_origin_check check (origin in ('opening', 'manual', 'confirmed')),
  drop constraint if exists transactions_note_length,
  add constraint transactions_note_length check (note is null or char_length(note) <= 500),
  drop constraint if exists transactions_idempotency_length,
  add constraint transactions_idempotency_length check (
    idempotency_key is null or char_length(idempotency_key) between 1 and 80
  ),
  drop constraint if exists transactions_transfer_shape,
  add constraint transactions_transfer_shape check (
    type <> 'transfer'
    or (
      counter_account_id is not null
      and counter_account_id <> account_id
      and settles_cash = false
      and fee = 0
    )
  ),
  drop constraint if exists transactions_opening_shape,
  add constraint transactions_opening_shape check (
    origin <> 'opening'
    or (settles_cash = false and type = 'buy')
  );

create unique index if not exists transactions_idempotency_idx
  on public.transactions (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transactions_asset_day_idx on public.transactions (asset_id, date);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

create or replace function private.default_account_name(
  p_kind public.account_kind,
  p_currency text
) returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'brokerage' then case when p_currency = 'usd' then 'کارگزاری دلاری' else 'کارگزاری' end
    when 'bullion' then case when p_currency = 'usd' then 'طلای دلاری' else 'طلا و سکه' end
    when 'fx' then case when p_currency = 'rial' then 'صرافی ریالی' else 'ارز و دلار' end
    else case when p_currency = 'usd' then 'کیف بیت‌کوین' else 'کیف ریالی' end
  end;
$$;

create or replace function private.ledger_account_kind(
  p_type public.asset_type,
  p_currency text
) returns public.account_kind
language sql
stable
set search_path = ''
as $$
  select case
    when p_type = 'crypto' then 'wallet'::public.account_kind
    when p_type in ('gold', 'coin') then 'bullion'::public.account_kind
    when p_type = 'usd' or p_currency = 'usd' then 'fx'::public.account_kind
    else 'brokerage'::public.account_kind
  end;
$$;

create or replace function private.ensure_default_account(
  p_user uuid,
  p_kind public.account_kind,
  p_currency text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_id uuid;
  account_name text;
begin
  if p_currency not in ('rial', 'usd') then
    raise exception 'currency' using errcode = '22023';
  end if;

  account_name := private.default_account_name(p_kind, p_currency);
  select id into found_id
  from public.accounts
  where user_id = p_user
    and name = account_name;

  if found_id is not null then
    return found_id;
  end if;

  insert into public.accounts (user_id, name, kind, currency)
  values (p_user, account_name, p_kind, p_currency)
  returning id into found_id;

  return found_id;
end;
$$;

create or replace function private.apply_position_delta(
  p_user uuid,
  p_account uuid,
  p_asset uuid,
  p_side text,
  p_qty numeric,
  p_price numeric,
  p_fee numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  held numeric;
  average numeric;
  known boolean;
  cost numeric;
begin
  insert into public.positions (user_id, account_id, asset_id, quantity)
  values (p_user, p_account, p_asset, 0)
  on conflict (account_id, asset_id) do nothing;

  select quantity, avg_buy_price
    into held, average
  from public.positions
  where account_id = p_account
    and asset_id = p_asset
  for update;

  if p_side = 'buy' then
    known := not (held > 0 and average is null) and p_price is not null;
    if known then
      cost := held * coalesce(average, 0) + p_qty * p_price + case when p_fee > 0 then p_fee else 0 end;
    end if;
    held := held + p_qty;
    if known and held > 0 then
      average := cost / held;
    else
      average := null;
    end if;
  elsif p_side = 'sell' then
    if p_qty > held then
      raise exception 'oversell' using errcode = '23514';
    end if;
    held := held - p_qty;
    if held <= 0 then
      held := 0;
      average := null;
    end if;
  else
    raise exception 'invalid' using errcode = '22023';
  end if;

  update public.positions
  set quantity = held,
      avg_buy_price = average
  where account_id = p_account
    and asset_id = p_asset;
end;
$$;

create or replace function private.apply_cash_delta(
  p_user uuid,
  p_account uuid,
  p_asset uuid,
  p_delta numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  held numeric;
  average numeric;
begin
  insert into public.positions (user_id, account_id, asset_id, quantity)
  values (p_user, p_account, p_asset, 0)
  on conflict (account_id, asset_id) do nothing;

  select quantity, avg_buy_price
    into held, average
  from public.positions
  where account_id = p_account
    and asset_id = p_asset
  for update;

  if held + p_delta < 0 then
    raise exception 'cash' using errcode = '23514';
  end if;

  if average is null then
    average := 1;
  end if;

  update public.positions
  set quantity = held + p_delta,
      avg_buy_price = average
  where account_id = p_account
    and asset_id = p_asset;
end;
$$;

create or replace function private.sync_asset_position(p_asset uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  held numeric;
  average numeric;
  first_day date;
begin
  select coalesce(sum(quantity), 0),
    case
      when coalesce(sum(quantity), 0) <= 0 then null
      when bool_or(quantity > 0 and avg_buy_price is null) then null
      else sum(quantity * avg_buy_price) / sum(quantity)
    end
    into held, average
  from public.positions
  where asset_id = p_asset;

  select min(date)
    into first_day
  from public.transactions
  where asset_id = p_asset
    and type in ('buy', 'deposit');

  if held <= 0 then
    first_day := null;
  end if;

  perform set_config('rahyar.post_entry', 'on', true);
  update public.assets
  set quantity = held,
      avg_buy_price = average,
      acquired_on = first_day
  where id = p_asset
    and type in ('stock', 'fund', 'gold', 'coin', 'usd', 'crypto', 'cash');
end;
$$;

create or replace function private.guard_ledger_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type not in ('stock', 'fund', 'gold', 'coin', 'usd', 'crypto', 'cash') then
    return new;
  end if;

  if coalesce(current_setting('rahyar.post_entry', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.quantity := 0;
    new.avg_buy_price := null;
    new.acquired_on := null;
    return new;
  end if;

  if new.quantity is distinct from old.quantity
    or new.avg_buy_price is distinct from old.avg_buy_price
    or new.acquired_on is distinct from old.acquired_on
    or new.price_unit is distinct from old.price_unit
    or new.type is distinct from old.type then
    raise exception 'ledger position' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.reject_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'posted transaction' using errcode = '42501';
end;
$$;

create or replace function private.keep_account_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind or new.currency is distinct from old.currency then
    raise exception 'currency' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.post_transaction(
  p_asset_id uuid,
  p_account_id uuid,
  p_type public.transaction_type,
  p_qty numeric,
  p_price numeric,
  p_fee numeric,
  p_traded_on date,
  p_settles_cash boolean,
  p_cash_asset_id uuid,
  p_counter_account_id uuid,
  p_origin text,
  p_fx_rate numeric,
  p_note text,
  p_idempotency_key text
) returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  existing public.transactions;
  asset public.assets;
  account public.accounts;
  counter public.accounts;
  cash_asset public.assets;
  cash_count integer;
  source_avg numeric;
  posted public.transactions;
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into existing
    from public.transactions
    where user_id = actor
      and idempotency_key = p_idempotency_key;
    if found then
      return existing;
    end if;
  end if;

  if p_qty is null or p_qty <= 0
    or (p_price is not null and p_price < 0)
    or p_fee is null or p_fee < 0
    or p_traded_on is null
    or p_origin not in ('opening', 'manual', 'confirmed')
    or (p_fx_rate is not null and p_fx_rate <= 0)
    or (p_note is not null and char_length(p_note) > 500)
    or (p_idempotency_key is not null and char_length(btrim(p_idempotency_key)) not between 1 and 80)
    or (p_origin = 'opening' and (p_settles_cash or p_type <> 'buy')) then
    raise exception 'invalid' using errcode = '22023';
  end if;

  select * into asset
  from public.assets
  where id = p_asset_id
  for update;

  if asset.id is null or asset.user_id <> actor then
    raise exception 'invalid' using errcode = '42501';
  end if;

  if asset.type not in ('stock', 'fund', 'gold', 'coin', 'usd', 'crypto', 'cash')
    or asset.price_unit not in ('rial', 'usd') then
    raise exception 'ledger' using errcode = '22023';
  end if;

  if p_account_id is null then
    p_account_id := private.ensure_default_account(
      actor,
      private.ledger_account_kind(asset.type, asset.price_unit),
      asset.price_unit
    );
  end if;

  if p_type = 'transfer' and (
    p_counter_account_id is null
    or p_counter_account_id = p_account_id
    or p_settles_cash
    or p_fee <> 0
  ) then
    raise exception 'invalid' using errcode = '22023';
  end if;

  perform 1
  from public.accounts
  where id = any (array[p_account_id, p_counter_account_id])
  order by id
  for update;

  select * into account
  from public.accounts
  where id = p_account_id;

  if account.id is null or account.user_id <> actor then
    raise exception 'account' using errcode = '42501';
  end if;

  if account.currency <> asset.price_unit then
    raise exception 'currency' using errcode = '22023';
  end if;

  if p_type = 'transfer' then
    select * into counter
    from public.accounts
    where id = p_counter_account_id;
    if counter.id is null or counter.user_id <> actor or counter.currency <> asset.price_unit then
      raise exception 'currency' using errcode = '22023';
    end if;
  elsif p_type in ('deposit', 'withdraw') then
    if asset.type not in ('cash', 'usd') or p_settles_cash or p_fee <> 0 then
      raise exception 'ledger' using errcode = '22023';
    end if;
  elsif p_type in ('buy', 'sell') then
    if asset.type in ('cash', 'usd') then
      raise exception 'ledger' using errcode = '22023';
    end if;
    if p_settles_cash and p_price is null then
      raise exception 'invalid' using errcode = '22023';
    end if;
    if p_type = 'sell' and p_fee > p_qty * coalesce(p_price, 0) then
      raise exception 'invalid' using errcode = '22023';
    end if;
  else
    raise exception 'invalid' using errcode = '22023';
  end if;

  if p_settles_cash then
    if p_cash_asset_id is null then
      select count(*) into cash_count
      from public.assets
      where user_id = actor
        and price_unit = asset.price_unit
        and type in ('cash', 'usd')
        and id <> asset.id;
      if cash_count <> 1 then
        raise exception 'cash' using errcode = '23514';
      end if;
      select id into p_cash_asset_id
      from public.assets
      where user_id = actor
        and price_unit = asset.price_unit
        and type in ('cash', 'usd')
        and id <> asset.id
      order by created_at
      limit 1;
    end if;

    select * into cash_asset
    from public.assets
    where id = p_cash_asset_id
    for update;

    if cash_asset.id is null
      or cash_asset.user_id <> actor
      or cash_asset.type not in ('cash', 'usd')
      or cash_asset.price_unit <> asset.price_unit
      or cash_asset.id = asset.id then
      raise exception 'cash' using errcode = '23514';
    end if;
  end if;

  perform set_config('rahyar.post_entry', 'on', true);

  begin
    insert into public.transactions (
      user_id,
      asset_id,
      account_id,
      counter_account_id,
      cash_asset_id,
      type,
      qty,
      price,
      fee,
      price_unit,
      fx_rate,
      settles_cash,
      origin,
      idempotency_key,
      date,
      note
    )
    values (
      actor,
      asset.id,
      account.id,
      case when p_type = 'transfer' then counter.id else null end,
      case when p_settles_cash then cash_asset.id else null end,
      p_type,
      p_qty,
      p_price,
      p_fee,
      asset.price_unit,
      p_fx_rate,
      p_settles_cash,
      p_origin,
      nullif(btrim(p_idempotency_key), ''),
      p_traded_on,
      nullif(btrim(p_note), '')
    )
    returning * into posted;
  exception
    when unique_violation then
      select * into existing
      from public.transactions
      where user_id = actor
        and idempotency_key = nullif(btrim(p_idempotency_key), '');
      if found then
        return existing;
      end if;
      raise;
  end;

  if p_type = 'buy' then
    perform private.apply_position_delta(actor, account.id, asset.id, 'buy', p_qty, p_price, p_fee);
    if p_settles_cash then
      perform private.apply_cash_delta(actor, account.id, cash_asset.id, -(p_qty * p_price + p_fee));
    end if;
  elsif p_type = 'sell' then
    perform private.apply_position_delta(actor, account.id, asset.id, 'sell', p_qty, null, 0);
    if p_settles_cash then
      perform private.apply_cash_delta(actor, account.id, cash_asset.id, p_qty * p_price - p_fee);
    end if;
  elsif p_type = 'deposit' then
    perform private.apply_cash_delta(actor, account.id, asset.id, p_qty);
  elsif p_type = 'withdraw' then
    perform private.apply_cash_delta(actor, account.id, asset.id, -p_qty);
  else
    select avg_buy_price into source_avg
    from public.positions
    where account_id = account.id
      and asset_id = asset.id;
    perform private.apply_position_delta(actor, account.id, asset.id, 'sell', p_qty, null, 0);
    perform private.apply_position_delta(actor, counter.id, asset.id, 'buy', p_qty, source_avg, 0);
  end if;

  perform private.sync_asset_position(asset.id);
  if p_settles_cash then
    perform private.sync_asset_position(cash_asset.id);
  end if;

  return posted;
end;
$$;

create or replace function public.post_transaction(
  p_asset_id uuid,
  p_type public.transaction_type,
  p_qty numeric,
  p_traded_on date,
  p_account_id uuid default null,
  p_price numeric default null,
  p_fee numeric default 0,
  p_settles_cash boolean default false,
  p_cash_asset_id uuid default null,
  p_counter_account_id uuid default null,
  p_origin text default 'manual',
  p_fx_rate numeric default null,
  p_note text default null,
  p_idempotency_key text default null
) returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return private.post_transaction(
    p_asset_id,
    p_account_id,
    p_type,
    p_qty,
    p_price,
    coalesce(p_fee, 0),
    p_traded_on,
    coalesce(p_settles_cash, false),
    p_cash_asset_id,
    p_counter_account_id,
    coalesce(p_origin, 'manual'),
    p_fx_rate,
    p_note,
    p_idempotency_key
  );
end;
$$;

drop trigger if exists assets_05_blank_listed_position on public.assets;
drop trigger if exists assets_06_keep_listed_position on public.assets;
drop trigger if exists assets_07_guard_ledger_position on public.assets;

create trigger assets_07_guard_ledger_position
  before insert or update on public.assets
  for each row execute function private.guard_ledger_position();

drop trigger if exists accounts_00_stamp_owner on public.accounts;
create trigger accounts_00_stamp_owner
  before insert or update on public.accounts
  for each row execute function private.stamp_owner();

drop trigger if exists accounts_10_keep_currency on public.accounts;
create trigger accounts_10_keep_currency
  before update on public.accounts
  for each row execute function private.keep_account_currency();

drop trigger if exists positions_00_stamp_owner on public.positions;
create trigger positions_00_stamp_owner
  before insert or update on public.positions
  for each row execute function private.stamp_owner();

drop trigger if exists positions_10_touch_updated_at on public.positions;
create trigger positions_10_touch_updated_at
  before update on public.positions
  for each row execute function private.touch_updated_at();

drop trigger if exists transactions_00_stamp_owner on public.transactions;
create trigger transactions_00_stamp_owner
  before insert or update on public.transactions
  for each row execute function private.stamp_owner();

-- The trades migration dropped this function together with public.transactions.
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

revoke all on function private.enforce_transaction_asset_owner() from public, anon, authenticated;
grant execute on function private.enforce_transaction_asset_owner() to authenticated;

drop trigger if exists transactions_10_enforce_asset_owner on public.transactions;
create trigger transactions_10_enforce_asset_owner
  before insert or update on public.transactions
  for each row execute function private.enforce_transaction_asset_owner();

alter table public.transactions drop constraint if exists transactions_asset_id_fkey;
alter table public.transactions
  add constraint transactions_asset_id_fkey
  foreign key (asset_id) references public.assets (id) on delete restrict;

do $$
begin
  if to_regclass('public.trades') is not null then
    drop trigger if exists trades_10_prepare on public.trades;
    drop trigger if exists trades_20_sync_position on public.trades;
    revoke insert, update, delete on table public.trades from authenticated;
  end if;
end
$$;

-- Historical stock trades become journal rows. Their cash leg is not applied again;
-- current cash quantity is opened as its own position below.
do $$
declare
  owner_id uuid;
  trade_row record;
  asset_row record;
  account_id uuid;
begin
  for owner_id in select distinct user_id from public.assets loop
    perform private.ensure_default_account(owner_id, 'brokerage', 'rial');
    perform private.ensure_default_account(owner_id, 'bullion', 'rial');
    perform private.ensure_default_account(owner_id, 'fx', 'usd');
    perform private.ensure_default_account(owner_id, 'wallet', 'usd');
  end loop;

  if to_regclass('public.trades') is not null then
    for trade_row in
      select
        trades.*,
        assets.type as asset_type,
        assets.price_unit as asset_unit
      from public.trades as trades
      join public.assets as assets on assets.id = trades.asset_id
      where trades.asset_id is not null
        and assets.type in ('stock', 'fund', 'gold', 'coin', 'usd', 'crypto', 'cash')
      order by trades.traded_on, trades.created_at
    loop
      account_id := private.ensure_default_account(
        trade_row.user_id,
        private.ledger_account_kind(trade_row.asset_type, trade_row.asset_unit),
        trade_row.asset_unit
      );
      insert into public.transactions (
        user_id,
        asset_id,
        account_id,
        cash_asset_id,
        type,
        qty,
        price,
        fee,
        price_unit,
        settles_cash,
        origin,
        date,
        created_at
      )
      values (
        trade_row.user_id,
        trade_row.asset_id,
        account_id,
        case when trade_row.settles_cash then trade_row.cash_asset_id else null end,
        trade_row.side::text::public.transaction_type,
        trade_row.quantity,
        trade_row.price,
        trade_row.fee,
        trade_row.asset_unit,
        trade_row.settles_cash,
        case
          when trade_row.side::text = 'buy' and trade_row.settles_cash = false then 'opening'
          else 'manual'
        end,
        trade_row.traded_on,
        trade_row.created_at
      );
      if trade_row.side::text = 'buy' then
        perform private.apply_position_delta(
          trade_row.user_id,
          account_id,
          trade_row.asset_id,
          'buy',
          trade_row.quantity,
          trade_row.price,
          trade_row.fee
        );
      else
        perform private.apply_position_delta(
          trade_row.user_id,
          account_id,
          trade_row.asset_id,
          'sell',
          trade_row.quantity,
          null,
          0
        );
      end if;
    end loop;
  end if;

  for asset_row in
    select *
    from public.assets
    where type in ('stock', 'fund', 'gold', 'coin', 'usd', 'crypto', 'cash')
      and quantity > 0
      and not exists (
        select 1 from public.positions where positions.asset_id = assets.id
      )
  loop
    account_id := private.ensure_default_account(
      asset_row.user_id,
      private.ledger_account_kind(asset_row.type, asset_row.price_unit),
      asset_row.price_unit
    );
    if asset_row.type in ('cash', 'usd') then
      insert into public.transactions (
        user_id, asset_id, account_id, type, qty, price, fee, price_unit, settles_cash, origin, date
      )
      values (
        asset_row.user_id,
        asset_row.id,
        account_id,
        'deposit',
        asset_row.quantity,
        0,
        0,
        asset_row.price_unit,
        false,
        'manual',
        coalesce(asset_row.acquired_on, (asset_row.created_at at time zone 'Asia/Tehran')::date)
      );
      perform private.apply_cash_delta(asset_row.user_id, account_id, asset_row.id, asset_row.quantity);
    else
      insert into public.transactions (
        user_id, asset_id, account_id, type, qty, price, fee, price_unit, settles_cash, origin, date
      )
      values (
        asset_row.user_id,
        asset_row.id,
        account_id,
        'buy',
        asset_row.quantity,
        asset_row.avg_buy_price,
        0,
        asset_row.price_unit,
        false,
        'opening',
        coalesce(asset_row.acquired_on, (asset_row.created_at at time zone 'Asia/Tehran')::date)
      );
      perform private.apply_position_delta(
        asset_row.user_id,
        account_id,
        asset_row.id,
        'buy',
        asset_row.quantity,
        asset_row.avg_buy_price,
        0
      );
    end if;
  end loop;

  for asset_row in
    select id
    from public.assets
    where type in ('stock', 'fund', 'gold', 'coin', 'usd', 'crypto', 'cash')
  loop
    perform private.sync_asset_position(asset_row.id);
  end loop;
end
$$;

update public.transactions as journal
set account_id = coalesce(
      journal.account_id,
      private.ensure_default_account(
        journal.user_id,
        private.ledger_account_kind(assets.type, assets.price_unit),
        assets.price_unit
      )
    ),
    price_unit = coalesce(journal.price_unit, assets.price_unit)
from public.assets as assets
where journal.asset_id = assets.id
  and (journal.account_id is null or journal.price_unit is null);

alter table public.transactions alter column account_id set not null;
alter table public.transactions alter column price_unit set not null;

drop trigger if exists transactions_30_append_only on public.transactions;
create trigger transactions_30_append_only
  before update or delete on public.transactions
  for each row execute function private.reject_transaction_change();

alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.positions enable row level security;
alter table public.positions force row level security;
alter table public.transactions enable row level security;
alter table public.transactions force row level security;

drop policy if exists accounts_owner on public.accounts;
create policy accounts_owner on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists positions_owner on public.positions;
create policy positions_owner on public.positions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists transactions_owner on public.transactions;
create policy transactions_owner on public.transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.accounts from public, anon;
revoke all on table public.positions from public, anon, authenticated;
revoke all on table public.transactions from public, anon, authenticated;
grant select, insert, update on table public.accounts to authenticated;
grant select on table public.positions to authenticated;
grant select on table public.transactions to authenticated;
grant select, insert, update, delete on table public.accounts to service_role;
grant select, insert, update, delete on table public.positions to service_role;
grant select, insert, update, delete on table public.transactions to service_role;

revoke all on function public.post_transaction(
  uuid, public.transaction_type, numeric, date, uuid, numeric, numeric, boolean, uuid, uuid, text, numeric, text, text
) from public, anon;
grant execute on function public.post_transaction(
  uuid, public.transaction_type, numeric, date, uuid, numeric, numeric, boolean, uuid, uuid, text, numeric, text, text
) to authenticated;

revoke all on function private.default_account_name(public.account_kind, text) from public, anon, authenticated;
revoke all on function private.ledger_account_kind(public.asset_type, text) from public, anon, authenticated;
revoke all on function private.ensure_default_account(uuid, public.account_kind, text) from public, anon, authenticated;
revoke all on function private.apply_position_delta(uuid, uuid, uuid, text, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function private.apply_cash_delta(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function private.sync_asset_position(uuid) from public, anon, authenticated;
revoke all on function private.guard_ledger_position() from public, anon, authenticated;
revoke all on function private.reject_transaction_change() from public, anon, authenticated;
revoke all on function private.keep_account_currency() from public, anon, authenticated;
revoke all on function private.post_transaction(
  uuid, uuid, public.transaction_type, numeric, numeric, numeric, date, boolean, uuid, uuid, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function private.post_transaction(
  uuid, uuid, public.transaction_type, numeric, numeric, numeric, date, boolean, uuid, uuid, text, numeric, text, text
) to authenticated;

comment on table public.accounts is
  'Named venue for a holding: brokerage, bullion desk, fx desk, or wallet.';
comment on table public.positions is
  'Quantity and average cost of one asset inside one account. assets.quantity is the sum.';
comment on function public.post_transaction(
  uuid, public.transaction_type, numeric, date, uuid, numeric, numeric, boolean, uuid, uuid, text, numeric, text, text
) is
  'Append-only journal entry. Updates positions and rewrites the asset quantity in the same transaction.';
