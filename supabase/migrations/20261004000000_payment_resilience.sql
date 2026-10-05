create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  delivery_key text not null unique,
  provider text not null default 'RAZORPAY',
  event_type text not null,
  provider_payment_id text,
  provider_order_id text,
  processing_status text not null check (processing_status in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
  processing_attempts integer not null default 0,
  failure_reason text,
  received_at timestamptz not null default now(),
  last_attempted_at timestamptz,
  processed_at timestamptz
);

create index payment_webhook_events_status_idx on public.payment_webhook_events (processing_status, received_at desc);
create index payment_webhook_events_order_idx on public.payment_webhook_events (provider_order_id) where provider_order_id is not null;
alter table public.payment_webhook_events enable row level security;

create or replace function public.claim_razorpay_webhook_event(
  p_delivery_key text,
  p_event_type text,
  p_provider_payment_id text,
  p_provider_order_id text
)
returns table (id uuid, claimed boolean)
language plpgsql
set search_path = public
as $$
begin
  return query
  insert into public.payment_webhook_events (
    delivery_key, event_type, provider_payment_id, provider_order_id, processing_status, processing_attempts, last_attempted_at
  ) values (
    p_delivery_key, p_event_type, p_provider_payment_id, p_provider_order_id, 'RECEIVED', 1, now()
  )
  on conflict (delivery_key) do update
    set processing_status = 'RECEIVED',
        processing_attempts = public.payment_webhook_events.processing_attempts + 1,
        last_attempted_at = now(),
        processed_at = null,
        failure_reason = null
    where public.payment_webhook_events.processing_status = 'FAILED'
       or (
         public.payment_webhook_events.processing_status = 'RECEIVED'
         and public.payment_webhook_events.last_attempted_at < now() - interval '5 minutes'
       )
  returning payment_webhook_events.id, true;
end;
$$;

revoke execute on function public.claim_razorpay_webhook_event(text, text, text, text) from public;
grant execute on function public.claim_razorpay_webhook_event(text, text, text, text) to service_role;

create or replace function public.finalize_captured_razorpay_payment(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount_paise bigint,
  p_currency text
)
returns table (booking_reference text, already_paid boolean)
language plpgsql
set search_path = public
as $$
declare
  current_payment public.payments%rowtype;
  current_booking public.bookings%rowtype;
begin
  select p.* into current_payment
  from public.payments p
  where p.provider = 'RAZORPAY' and p.provider_order_id = p_provider_order_id
  for update;

  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  select b.* into current_booking
  from public.bookings b
  where b.id = current_payment.booking_id
  for update;

  if current_payment.provider_payment_id is not null and current_payment.provider_payment_id <> p_provider_payment_id then
    raise exception 'PAYMENT_ID_CONFLICT';
  end if;
  if current_payment.currency <> 'INR' or p_currency <> 'INR'
    or current_booking.currency <> current_payment.currency
    or round(current_payment.amount * 100)::bigint <> p_amount_paise
    or current_booking.amount <> current_payment.amount then
    raise exception 'PAYMENT_METADATA_MISMATCH';
  end if;

  if current_payment.status = 'PAID' and current_booking.payment_status = 'PAID' then
    return query select current_booking.booking_reference, true;
    return;
  end if;

  if current_payment.status <> 'PENDING' or current_booking.payment_status <> 'PENDING' then
    raise exception 'PAYMENT_STATE_INCONSISTENT';
  end if;

  update public.payments
  set status = 'PAID', provider_payment_id = p_provider_payment_id, paid_at = now()
  where id = current_payment.id;

  update public.bookings
  set payment_status = 'PAID'
  where id = current_booking.id;

  return query select current_booking.booking_reference, false;
end;
$$;

revoke execute on function public.finalize_captured_razorpay_payment(text, text, bigint, text) from public;
grant execute on function public.finalize_captured_razorpay_payment(text, text, bigint, text) to service_role;
