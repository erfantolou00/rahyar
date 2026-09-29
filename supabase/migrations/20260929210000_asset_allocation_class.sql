alter table public.assets
  add column allocation_class public.asset_type,
  add column allocation_class_source text not null default 'auto'
    constraint assets_allocation_class_source_check
      check (allocation_class_source in ('auto', 'manual'));

update public.assets
set allocation_class = case
  when regexp_replace(symbol, '[[:space:]]', '', 'g') ~ 'طلا|سکه|عیار|امامی|مثقال|کهربا|گوهر|آلتون|زرفام|جواهر|gold'
    then 'gold'::public.asset_type
  when type in ('gold', 'coin') then 'gold'::public.asset_type
  else type
end
where allocation_class is null;

alter table public.assets
  alter column allocation_class set not null;

comment on column public.assets.type is
  'Instrument: coin, fund, stock, and so on. Not the allocation bucket.';
comment on column public.assets.allocation_class is
  'Single economic class used for allocation bands. Coins and gold funds are gold unless the owner locks another class.';
comment on column public.assets.allocation_class_source is
  'auto: recomputed from type and name. manual: the owner locked allocation_class.';
