-- Deleting an asset removes its position and its own posted trades.
-- A trade that only used this asset as the cash leg keeps its row and drops that link.
-- Ordinary edits of a posted trade stay blocked.

create or replace function private.reject_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('rahyar.delete_asset', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    if tg_op = 'UPDATE'
      and new.cash_asset_id is null
      and pg_catalog.to_jsonb(new) - 'cash_asset_id' = pg_catalog.to_jsonb(old) - 'cash_asset_id'
    then
      return new;
    end if;
  end if;

  raise exception 'posted transaction' using errcode = '42501';
end;
$$;

create or replace function private.remove_asset_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('rahyar.delete_asset', 'on', true);

  delete from public.positions
  where asset_id = old.id;

  update public.transactions
     set cash_asset_id = null
   where cash_asset_id = old.id
     and asset_id is distinct from old.id;

  delete from public.transactions
  where asset_id = old.id;

  return old;
end;
$$;

drop trigger if exists assets_05_remove_ledger on public.assets;

create trigger assets_05_remove_ledger
  before delete on public.assets
  for each row execute function private.remove_asset_ledger();

revoke all on function private.remove_asset_ledger() from public, anon;
grant execute on function private.remove_asset_ledger() to authenticated, service_role;

comment on function private.remove_asset_ledger() is
  'Before an asset row goes away, remove its position and its own trades.';
