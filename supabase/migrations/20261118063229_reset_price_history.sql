-- After Friday's weekly report, drop the tick log and keep the newest quote of each symbol.
-- Daily closes in price_days stay. Only the service cron may call this.

create or replace function public.reset_price_history(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed integer;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'invalid' using errcode = '22023';
  end if;

  delete from public.prices as price
  where price.user_id = p_user_id
    and price.id not in (
      select distinct on (asset_type, symbol) id
      from public.prices
      where user_id = p_user_id
      order by asset_type, symbol, "timestamp" desc, id desc
    );

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.reset_price_history(uuid) from public, anon, authenticated;
grant execute on function public.reset_price_history(uuid) to service_role;

comment on function public.reset_price_history(uuid) is
  'Drops stored price ticks for one owner and keeps the newest quote of each symbol. The weekly cron calls this after Friday''s report.';
