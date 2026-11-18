-- Nightly close of the whole book and of each holding.
-- The cron writes Tehran's calendar day. Opening the book the same day refreshes that row.

create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  total_value numeric not null,
  captured_at timestamptz not null default now(),
  constraint portfolio_snapshots_user_day_key unique (user_id, day),
  constraint portfolio_snapshots_total_nonnegative check (total_value >= 0)
);

comment on table public.portfolio_snapshots is
  'One closing value of the whole book per Tehran day. Used for today''s move and the performance line.';

create table public.holding_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  day date not null,
  quantity numeric not null,
  price numeric,
  value numeric not null,
  captured_at timestamptz not null default now(),
  constraint holding_snapshots_user_asset_day_key unique (user_id, asset_id, day),
  constraint holding_snapshots_quantity_nonnegative check (quantity >= 0),
  constraint holding_snapshots_price_nonnegative check (price is null or price >= 0),
  constraint holding_snapshots_value_nonnegative check (value >= 0)
);

comment on table public.holding_snapshots is
  'One closing price and value per holding per Tehran day. price uses the same unit shown on the holding card.';

create index portfolio_snapshots_user_day_idx on public.portfolio_snapshots (user_id, day desc);
create index holding_snapshots_user_day_idx on public.holding_snapshots (user_id, day desc);
create index holding_snapshots_asset_day_idx on public.holding_snapshots (asset_id, day desc);

create trigger portfolio_snapshots_stamp_owner
  before insert or update on public.portfolio_snapshots
  for each row execute function private.stamp_owner();

create trigger holding_snapshots_stamp_owner
  before insert or update on public.holding_snapshots
  for each row execute function private.stamp_owner();

alter table public.portfolio_snapshots enable row level security;
alter table public.portfolio_snapshots force row level security;
alter table public.holding_snapshots enable row level security;
alter table public.holding_snapshots force row level security;

create policy portfolio_snapshots_owner on public.portfolio_snapshots
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy holding_snapshots_owner on public.holding_snapshots
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.portfolio_snapshots from public, anon;
revoke all on table public.holding_snapshots from public, anon;
grant select, insert, update, delete on table public.portfolio_snapshots to authenticated;
grant select, insert, update, delete on table public.holding_snapshots to authenticated;
