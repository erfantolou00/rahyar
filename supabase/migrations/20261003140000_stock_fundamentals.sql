-- Codal fundamentals for stock holdings, and a notice when a new letter or a profit revision arrives.
-- Apply with the rest of supabase/migrations (SQL editor or supabase db push).

alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts drop constraint if exists alerts_deviation_shape;

alter table public.alerts
  add constraint alerts_kind_check
    check (kind in ('rule', 'allocation_deviation', 'codal_notice')),
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
      or (
        kind = 'codal_notice'
        and message is not null
        and asset_type = 'stock'
      )
    );

comment on column public.alerts.kind is
  'rule: a threshold the owner wrote. allocation_deviation: a text suggestion. codal_notice: a new Codal letter or a profit revision. Never an order.';

create unique index if not exists alerts_one_codal_notice_idx
  on public.alerts (user_id, rule)
  where kind = 'codal_notice' and is_active;

alter table public.alert_frequencies drop constraint if exists alert_frequencies_kind_check;
alter table public.alert_frequencies
  add constraint alert_frequencies_kind_check
    check (kind in ('rule', 'allocation_deviation', 'codal_notice'));

create table public.stock_fundamentals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  pe numeric,
  eps numeric,
  roe numeric,
  profit_margin numeric,
  sales_trend jsonb not null default '[]'::jsonb,
  latest_tracing_no text,
  latest_title text,
  published_label text,
  adjusted boolean not null default false,
  source text not null,
  shape_error text,
  fetched_at timestamptz not null default now(),
  constraint stock_fundamentals_user_symbol_key unique (user_id, symbol),
  constraint stock_fundamentals_symbol_not_blank check (char_length(btrim(symbol)) between 1 and 32),
  constraint stock_fundamentals_source_length check (char_length(btrim(source)) between 1 and 80),
  constraint stock_fundamentals_title_length check (latest_title is null or char_length(btrim(latest_title)) between 1 and 400),
  constraint stock_fundamentals_tracing_length check (latest_tracing_no is null or char_length(btrim(latest_tracing_no)) between 1 and 20),
  constraint stock_fundamentals_published_length check (published_label is null or char_length(btrim(published_label)) between 1 and 40),
  constraint stock_fundamentals_shape_error_length check (shape_error is null or char_length(btrim(shape_error)) between 1 and 300),
  constraint stock_fundamentals_sales_trend_array check (jsonb_typeof(sales_trend) = 'array')
);

comment on table public.stock_fundamentals is
  'Latest Codal ratios for one stock symbol. sales_trend is monthly sales points. shape_error is set when the Codal payload no longer matches the parser.';

create index stock_fundamentals_user_idx on public.stock_fundamentals (user_id, symbol);

create trigger stock_fundamentals_stamp_owner
  before insert or update on public.stock_fundamentals
  for each row execute function private.stamp_owner();

alter table public.stock_fundamentals enable row level security;
alter table public.stock_fundamentals force row level security;

create policy stock_fundamentals_owner on public.stock_fundamentals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.stock_fundamentals from public, anon;
grant select, insert, update, delete on table public.stock_fundamentals to authenticated;
