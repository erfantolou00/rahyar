-- A material FIS label or score change after a new financial statement.
-- The row is a notice. It never creates a transaction.

alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts drop constraint if exists alerts_deviation_shape;

alter table public.alerts
  add constraint alerts_kind_check
    check (kind in ('rule', 'allocation_deviation', 'codal_notice', 'fis_change')),
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
      or (
        kind = 'fis_change'
        and message is not null
        and asset_type = 'stock'
      )
    );

comment on column public.alerts.kind is
  'rule: a threshold the owner wrote. allocation_deviation: a text suggestion. codal_notice: a new Codal letter or a profit revision. fis_change: a material FIS label or score change after a new statement. Never an order.';

create unique index if not exists alerts_one_fis_change_idx
  on public.alerts (user_id, rule)
  where kind = 'fis_change' and is_active;

alter table public.alert_frequencies drop constraint if exists alert_frequencies_kind_check;
alter table public.alert_frequencies
  add constraint alert_frequencies_kind_check
    check (kind in ('rule', 'allocation_deviation', 'codal_notice', 'fis_change'));
