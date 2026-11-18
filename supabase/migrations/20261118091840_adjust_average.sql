-- A cost correction changes the average buy price and leaves the quantity alone.
-- It is one posted event, not a buy and a sell.

create or replace function private.adjust_average(
  p_asset_id uuid,
  p_price numeric,
  p_traded_on date,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  asset public.assets;
  account_id uuid;
  held numeric;
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_price is null or p_price < 0 or p_traded_on is null
    or (p_note is not null and char_length(p_note) > 500) then
    raise exception 'invalid' using errcode = '22023';
  end if;

  select * into asset
  from public.assets
  where id = p_asset_id
  for update;

  if asset.id is null or asset.user_id <> actor then
    raise exception 'invalid' using errcode = '42501';
  end if;

  if asset.type not in ('stock', 'fund', 'gold', 'coin', 'crypto')
    or asset.price_unit not in ('rial', 'usd') then
    raise exception 'ledger' using errcode = '22023';
  end if;

  select coalesce(sum(quantity), 0) into held
  from public.positions
  where asset_id = asset.id;

  if held <= 0 then
    raise exception 'empty' using errcode = '23514';
  end if;

  account_id := private.ensure_default_account(
    actor,
    private.ledger_account_kind(asset.type, asset.price_unit),
    asset.price_unit
  );

  perform pg_catalog.set_config('rahyar.post_entry', 'on', true);

  insert into public.transactions (
    user_id,
    asset_id,
    account_id,
    type,
    qty,
    price,
    fee,
    price_unit,
    settles_cash,
    origin,
    date,
    note
  ) values (
    actor,
    asset.id,
    account_id,
    'adjust',
    held,
    p_price,
    0,
    asset.price_unit,
    false,
    'manual',
    p_traded_on,
    nullif(btrim(p_note), '')
  );

  update public.positions
     set avg_buy_price = p_price
   where asset_id = asset.id
     and quantity > 0;

  perform private.sync_asset_position(asset.id);
end;
$$;

create or replace function public.adjust_average(
  p_asset_id uuid,
  p_price numeric,
  p_traded_on date,
  p_note text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  perform private.adjust_average(p_asset_id, p_price, p_traded_on, p_note);
end;
$$;

revoke all on function private.adjust_average(uuid, numeric, date, text) from public, anon;
grant execute on function private.adjust_average(uuid, numeric, date, text) to authenticated;

revoke all on function public.adjust_average(uuid, numeric, date, text) from public, anon;
grant execute on function public.adjust_average(uuid, numeric, date, text) to authenticated;

comment on function public.adjust_average(uuid, numeric, date, text) is
  'Records a cost correction: the holding quantity stays, the average buy price changes.';
