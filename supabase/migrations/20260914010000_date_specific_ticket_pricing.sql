create table public.event_day_ticket_prices (
  id uuid primary key default gen_random_uuid(),
  event_day_id uuid not null references public.event_days(id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  price numeric(12,2) not null check (price >= 1 and price <= 1000000 and price = trunc(price)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_day_id, ticket_type_id)
);

create index event_day_ticket_prices_event_day_id_idx on public.event_day_ticket_prices(event_day_id);
create trigger event_day_ticket_prices_set_updated_at before update on public.event_day_ticket_prices for each row execute function public.set_updated_at();
alter table public.event_day_ticket_prices enable row level security;

create or replace function public.create_pending_booking(
  p_event_day_number smallint,
  p_ticket_type_code text,
  p_quantity smallint,
  p_customer_name text,
  p_mobile text,
  p_email text,
  p_idempotency_key uuid
)
returns table (booking_reference text, amount numeric, currency text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare selected_day public.event_days%rowtype; selected_type public.ticket_types%rowtype; effective_price numeric(12,2); customer_uuid uuid; existing_booking public.bookings%rowtype; new_reference text;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then raise exception 'Invalid quantity'; end if;
  if p_customer_name is null or btrim(p_customer_name) !~ '^[[:alpha:][:space:].''-]{2,120}$' then raise exception 'Invalid customer name'; end if;
  if p_mobile is null or regexp_replace(btrim(p_mobile), '[ -]', '', 'g') !~ '^(\+91)?[6-9][0-9]{9}$' then raise exception 'Invalid mobile number'; end if;
  if p_email is not null and (char_length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email address'; end if;
  select * into existing_booking from public.bookings where idempotency_key = p_idempotency_key;
  if found then return query select existing_booking.booking_reference, existing_booking.amount, existing_booking.currency::text; return; end if;
  select * into selected_day from public.event_days where day_number = p_event_day_number and active = true;
  if not found then raise exception 'Selected event day is unavailable'; end if;
  select * into selected_type from public.ticket_types where code = p_ticket_type_code and active = true;
  if not found then raise exception 'Selected ticket type is unavailable'; end if;
  select price into effective_price from public.event_day_ticket_prices where event_day_id = selected_day.id and ticket_type_id = selected_type.id;
  effective_price := coalesce(effective_price, selected_type.price);
  if effective_price <= 0 then raise exception 'Ticket pricing is not configured'; end if;
  insert into public.customers (name, mobile, email) values (btrim(p_customer_name), btrim(p_mobile), nullif(btrim(p_email), ''))
  on conflict (mobile) do update set name = excluded.name, email = coalesce(excluded.email, public.customers.email)
  returning id into customer_uuid;
  new_reference := 'BOOK-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));
  insert into public.bookings (booking_reference, customer_id, event_day_id, ticket_type_id, quantity, amount, currency, payment_status, idempotency_key)
  values (new_reference, customer_uuid, selected_day.id, selected_type.id, p_quantity, effective_price * p_quantity, selected_type.currency, 'PENDING', p_idempotency_key);
  insert into public.payments (booking_id, provider, amount, currency, status)
  select b.id, 'RAZORPAY', b.amount, b.currency, 'PENDING' from public.bookings b where b.booking_reference = new_reference;
  return query select new_reference, effective_price * p_quantity, selected_type.currency::text;
end;
$$;

revoke all on function public.create_pending_booking(smallint, text, smallint, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_pending_booking(smallint, text, smallint, text, text, text, uuid) to service_role;
