-- Numbers the owner types for one stock. Blank fields stay with Codal.
-- Apply in the Supabase SQL editor if the manual form says it could not save.

alter table public.stock_fundamentals
  add column if not exists manual_sheet jsonb not null default '{}'::jsonb;

alter table public.stock_fundamentals
  drop constraint if exists stock_fundamentals_manual_sheet_object;

alter table public.stock_fundamentals
  add constraint stock_fundamentals_manual_sheet_object
    check (jsonb_typeof(manual_sheet) = 'object');

comment on column public.stock_fundamentals.manual_sheet is
  'Owner-entered FIS figures for one symbol. Missing keys fall back to the Codal statement.';
