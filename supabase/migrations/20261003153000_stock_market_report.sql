-- Price-change report stored beside Codal ratios. Percents are already in percent points.

alter table public.stock_fundamentals
  add column if not exists market_report jsonb not null default '{}'::jsonb;

alter table public.stock_fundamentals
  drop constraint if exists stock_fundamentals_market_report_object;

alter table public.stock_fundamentals
  add constraint stock_fundamentals_market_report_object
    check (jsonb_typeof(market_report) = 'object');

comment on column public.stock_fundamentals.market_report is
  'Calculated daily, monthly, quarterly, and yearly price changes, plus a Rahavard snapshot. Empty object means not fetched yet.';
