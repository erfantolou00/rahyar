update public.prices
set asset_type = 'usd'
where symbol = 'USD'
  and asset_type = 'cash';

update public.assets
set type = 'usd'
where type = 'cash'
  and symbol in ('USD', 'usd', 'dollar', 'دلار');
