-- Manual mark-to-market for the basket page. Later phases can replace this
-- with a market feed; profit, loss, and weight already take a current value.

alter table public.assets
  add column manual_value numeric;

alter table public.assets
  add constraint assets_manual_value_nonnegative
  check (manual_value is null or manual_value >= 0);

comment on column public.assets.manual_value is
  'Owner-entered current value for this phase. Null means unmarked.';
