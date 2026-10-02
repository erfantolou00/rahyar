-- The weekly cron reads one owner's books with the secret key and inserts a report.
-- service_role bypasses row level security; these grants are the remaining gate.

create index reports_user_type_created_idx
  on public.reports (user_id, type, created_at desc);

comment on index public.reports_user_type_created_idx is
  'Latest weekly report for one owner, used as the previous-week baseline.';

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant select on table public.assets to service_role;
    grant select on table public.prices to service_role;
    grant select on table public.allocations to service_role;
    grant select on table public.alerts to service_role;
    grant select, delete on table public.push_subscriptions to service_role;
    grant select, insert, update on table public.reports to service_role;
    grant insert on table public.chat_logs to service_role;
  end if;
end;
$$;
