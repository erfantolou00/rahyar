-- Allocation deviation notices are text only. They never create a transaction.

alter table public.alerts
  add column kind text not null default 'rule',
  add column message text,
  add column asset_type public.asset_type,
  add column created_at timestamptz not null default now();

alter table public.alerts
  add constraint alerts_kind_check
    check (kind in ('rule', 'allocation_deviation')),
  add constraint alerts_message_length
    check (message is null or char_length(btrim(message)) between 1 and 500),
  add constraint alerts_deviation_shape
    check (
      kind = 'rule'
      or (
        kind = 'allocation_deviation'
        and message is not null
        and asset_type is not null
        and channel = 'in_app'
        and frequency = 'display_only'
      )
    );

create unique index alerts_one_active_deviation_per_type_idx
  on public.alerts (user_id, asset_type)
  where kind = 'allocation_deviation' and is_active and asset_type is not null;

comment on column public.alerts.kind is
  'rule: a threshold the owner wrote. allocation_deviation: a text suggestion. Never an order.';
comment on column public.alerts.message is
  'Explanatory sentence for an allocation deviation. Display only.';

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
  recorded_at timestamptz := pg_catalog.now();
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
     set valid_to = recorded_at
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
    recorded_at
  )
  returning * into inserted;

  return inserted;
end;
$$;
