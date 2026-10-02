-- Telegram chat id is unused after delivery moved to Bale and browser push.
-- The guard trigger reads the column, so it has to go before the drop.

drop trigger if exists settings_10_protect_telegram_chat_id on public.settings;

drop function if exists private.protect_telegram_chat_id();

alter table public.settings
  drop column telegram_chat_id;

comment on table public.settings is
  'Per-user preferences.';
