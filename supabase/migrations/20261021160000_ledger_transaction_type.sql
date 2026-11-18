-- Adds the transfer value before the ledger function is created.
-- PostgreSQL cannot use a new enum value in the same transaction that adds it.

do $$
begin
  if not exists (
    select 1
    from pg_type as type
    join pg_namespace as namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typname = 'transaction_type'
  ) then
    create type public.transaction_type as enum (
      'buy',
      'sell',
      'deposit',
      'withdraw',
      'transfer'
    );
  else
    alter type public.transaction_type add value if not exists 'transfer';
  end if;
end
$$;
