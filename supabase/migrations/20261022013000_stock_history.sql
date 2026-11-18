-- Fundamental history for one symbol: each Codal filing, monthly sales, and FIS score.
-- A revision is its own row (revision_of points at the original tracing number).
-- Apply with the rest of supabase/migrations (SQL editor or supabase db push).

create table public.stock_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  period text not null,
  months integer not null,
  kind text not null,
  tracing_no text not null,
  revision_of text,
  figures jsonb not null,
  source text not null,
  fetched_at timestamptz not null default now(),
  constraint stock_periods_user_symbol_tracing_key unique (user_id, symbol, tracing_no),
  constraint stock_periods_symbol_not_blank check (char_length(btrim(symbol)) between 1 and 32),
  constraint stock_periods_period_shape check (period ~ '^\d{4}/\d{2}/\d{2}$'),
  constraint stock_periods_months_check check (months between 1 and 12),
  constraint stock_periods_kind_check check (kind in ('interim', 'annual')),
  constraint stock_periods_kind_months check (
    (kind = 'annual' and months >= 12)
    or (kind = 'interim' and months < 12)
  ),
  constraint stock_periods_tracing_length check (char_length(btrim(tracing_no)) between 1 and 40),
  constraint stock_periods_revision_length check (revision_of is null or char_length(btrim(revision_of)) between 1 and 40),
  constraint stock_periods_revision_not_self check (revision_of is null or revision_of <> tracing_no),
  constraint stock_periods_figures_object check (jsonb_typeof(figures) = 'object'),
  constraint stock_periods_source_length check (char_length(btrim(source)) between 1 and 80)
);

comment on table public.stock_periods is
  'One financial statement filing. period is the Jalali end from the Codal parser (1404/06/31). figures matches StatementFigures, in million rials. A revision does not replace the original row.';

comment on column public.stock_periods.revision_of is
  'Tracing number of the original filing when this row is an اصلاحیه. Null on the original.';

create index stock_periods_user_symbol_period_idx
  on public.stock_periods (user_id, symbol, period desc);

create trigger stock_periods_stamp_owner
  before insert or update on public.stock_periods
  for each row execute function private.stamp_owner();

alter table public.stock_periods enable row level security;
alter table public.stock_periods force row level security;

create policy stock_periods_owner on public.stock_periods
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.stock_periods from public, anon;
grant select, insert, update, delete on table public.stock_periods to authenticated;

create table public.stock_monthly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  period text not null,
  sales_value numeric,
  sales_qty numeric,
  production_qty numeric,
  avg_rate numeric,
  tracing_no text not null,
  source text not null,
  constraint stock_monthly_user_symbol_period_key unique (user_id, symbol, period),
  constraint stock_monthly_symbol_not_blank check (char_length(btrim(symbol)) between 1 and 32),
  constraint stock_monthly_period_shape check (period ~ '^\d{4}/\d{2}/\d{2}$'),
  constraint stock_monthly_tracing_length check (char_length(btrim(tracing_no)) between 1 and 40),
  constraint stock_monthly_source_length check (char_length(btrim(source)) between 1 and 80)
);

comment on table public.stock_monthly is
  'One monthly sales filing per period. sales_value is million rials. Quantity, production, and average rate stay null until a parser reads them.';

create trigger stock_monthly_stamp_owner
  before insert or update on public.stock_monthly
  for each row execute function private.stamp_owner();

alter table public.stock_monthly enable row level security;
alter table public.stock_monthly force row level security;

create policy stock_monthly_owner on public.stock_monthly
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.stock_monthly from public, anon;
grant select, insert, update, delete on table public.stock_monthly to authenticated;

create table public.stock_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  as_of timestamptz not null default now(),
  trigger text not null,
  score numeric,
  status text not null,
  model_version text not null,
  factors jsonb not null,
  observation jsonb not null,
  forward_pe numeric,
  constraint stock_scores_symbol_not_blank check (char_length(btrim(symbol)) between 1 and 32),
  constraint stock_scores_trigger_check check (trigger in ('manual', 'statement', 'backfill')),
  constraint stock_scores_status_check check (status in ('enter', 'hold', 'exit', 'watch', 'excluded')),
  constraint stock_scores_model_length check (char_length(btrim(model_version)) between 1 and 80),
  constraint stock_scores_factors_array check (jsonb_typeof(factors) = 'array'),
  constraint stock_scores_observation_object check (jsonb_typeof(observation) = 'object')
);

comment on table public.stock_scores is
  'One FIS assessment. Status is a label, not an order. score and forward_pe stay null when the engine has no number.';

create index stock_scores_user_symbol_as_of_idx
  on public.stock_scores (user_id, symbol, as_of desc);

create trigger stock_scores_stamp_owner
  before insert or update on public.stock_scores
  for each row execute function private.stamp_owner();

alter table public.stock_scores enable row level security;
alter table public.stock_scores force row level security;

create policy stock_scores_owner on public.stock_scores
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.stock_scores from public, anon;
grant select, insert, update, delete on table public.stock_scores to authenticated;
