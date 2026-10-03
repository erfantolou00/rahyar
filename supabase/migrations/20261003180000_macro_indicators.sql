-- Shared US macro observations used beside gold and bitcoin. Not owned by a user.
-- The weekly cron writes with the service role. Signed-in users can only read.

create table public.macro_indicators (
  id uuid primary key default gen_random_uuid(),
  indicator text not null,
  value numeric not null,
  date date not null,
  source text not null,
  fetched_at timestamptz not null default now(),
  constraint macro_indicators_indicator_known check (indicator in ('cpi', 'fed_funds', 'dxy')),
  constraint macro_indicators_source_length check (char_length(btrim(source)) between 1 and 80),
  constraint macro_indicators_indicator_date_key unique (indicator, date)
);

comment on table public.macro_indicators is
  'FRED observations for US CPI, the federal funds rate, and the broad dollar index. One row per indicator and observation date.';

create index macro_indicators_indicator_date_idx
  on public.macro_indicators (indicator, date desc);

alter table public.macro_indicators enable row level security;
alter table public.macro_indicators force row level security;

create policy macro_indicators_read on public.macro_indicators
  for select to authenticated
  using (true);

revoke all on table public.macro_indicators from public, anon;
grant select on table public.macro_indicators to authenticated;
grant select, insert, update, delete on table public.macro_indicators to service_role;
