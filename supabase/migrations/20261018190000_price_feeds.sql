-- Per-user switches for automatic price and Codal fetches.
-- Built-in markets and current stock or fund holdings stay in the list even without a row.
-- added is true only when the owner attached the symbol from the prices screen.

create table public.price_feeds (
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_type public.asset_type not null,
  symbol text not null,
  price_enabled boolean not null default true,
  codal_enabled boolean not null default false,
  added boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, asset_type, symbol),
  constraint price_feeds_symbol_not_blank check (char_length(btrim(symbol)) between 1 and 32)
);

comment on table public.price_feeds is
  'Per-user switches for automatic price and Codal fetches. added is true when the owner created the symbol from the prices screen.';

create trigger price_feeds_stamp_owner
  before insert or update on public.price_feeds
  for each row execute function private.stamp_owner();

alter table public.price_feeds enable row level security;
alter table public.price_feeds force row level security;

create policy price_feeds_owner on public.price_feeds
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.price_feeds from public, anon;
grant select, insert, update, delete on table public.price_feeds to authenticated;
grant select, insert, update, delete on table public.price_feeds to service_role;
