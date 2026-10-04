create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  delivery_key text not null unique,
  provider text not null default 'RAZORPAY',
  event_type text not null,
  provider_payment_id text,
  provider_order_id text,
  processing_status text not null check (processing_status in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
  failure_reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index payment_webhook_events_status_idx on public.payment_webhook_events (processing_status, received_at desc);
create index payment_webhook_events_order_idx on public.payment_webhook_events (provider_order_id) where provider_order_id is not null;
alter table public.payment_webhook_events enable row level security;
