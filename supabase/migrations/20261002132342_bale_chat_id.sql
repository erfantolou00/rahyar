-- Bale messenger chat id for alert delivery. The owner can replace it.

alter table public.settings
  add column bale_chat_id text;

alter table public.settings
  add constraint settings_bale_chat_id_shape check (
    bale_chat_id is null
    or bale_chat_id ~ '^-?[0-9]{1,20}$'
  );

comment on column public.settings.bale_chat_id is
  'Bale chat id. Null until the owner saves it. Delivery stays unsent when Bale rejects the message.';
