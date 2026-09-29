alter table public.assets
  add column price_unit text not null default 'rial'
  constraint assets_price_unit_check check (price_unit in ('rial', 'usd'));

update public.assets
set
  price_unit = 'usd',
  manual_value = case when manual_value > 1000000 then null else manual_value end
where type = 'crypto'
  and coalesce(avg_buy_price, 0) <= 1000000;
