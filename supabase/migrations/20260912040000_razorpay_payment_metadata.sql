alter table public.payments
  add column if not exists provider_signature text,
  add column if not exists paid_at timestamptz,
  add column if not exists failure_reason text;

create index if not exists payments_provider_order_id_idx
  on public.payments (provider_order_id) where provider_order_id is not null;
